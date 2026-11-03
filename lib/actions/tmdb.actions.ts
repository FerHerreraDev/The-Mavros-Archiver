'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/guards'
import { createTmdb, fillEmpty, isGenericEpisodeTitle, TMDB_NOT_CONFIGURED, type TmdbResult } from '@/lib/tmdb/client.mjs'
import { BACKDROP_MAX_WIDTH, LOGO_MAX_WIDTH, accentColor, processPoster, uploadPoster } from '@/lib/poster/thumbhash'
import type { SupabaseClient } from '@supabase/supabase-js'

// Panel: llenar datos desde TMDB (TMDB-02, TMDB-03). Solo admins; la clave nunca sale del servidor.
export type TmdbSearchResult = { results?: TmdbResult[]; error?: string }
export type TmdbApplyResult = { success?: string; error?: string }

const DENIED = 'Acceso denegado. Se requieren privilegios de administrador.'
const UNAVAILABLE = 'TMDB no respondió. Intenta de nuevo en un momento.'
const Kind = z.enum(['movie', 'series'])
const table = (kind: 'movie' | 'series') => (kind === 'movie' ? 'movies' : 'series')

export async function searchTmdbAction(input: { kind: string; query: string; year?: number | null }): Promise<TmdbSearchResult> {
  if (!(await requireAdmin())) return { error: DENIED }
  const parsed = z.object({ kind: Kind, query: z.string().trim().min(1, 'Escribe qué buscar.').max(200), year: z.number().int().nullish() }).safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const tmdb = createTmdb()
  if (!tmdb) return { error: TMDB_NOT_CONFIGURED }
  try {
    const results = await tmdb.search(parsed.data.kind === 'movie' ? 'movie' : 'tv', parsed.data.query, parsed.data.year)
    return { results }
  } catch (err) {
    console.warn('[TMDB] búsqueda:', (err as Error).message)
    return { error: UNAVAILABLE }
  }
}

const MAX_WIDTH = { poster: undefined, backdrop: BACKDROP_MAX_WIDTH, logo: LOGO_MAX_WIDTH }

/**
 * Vista previa y copia optimizada de una imagen nueva (LOAD-03/07); si falla, queda la URL.
 * La imagen horizontal trae además su color (TMDB-07); el logo no tiene vista previa.
 */
async function imageFields(supabase: SupabaseClient, url: string | undefined, prefix: 'poster' | 'backdrop' | 'logo') {
  if (!url) return {}
  const processed = await processPoster(url, undefined, MAX_WIDTH[prefix])
  const copy = processed.image ? await uploadPoster(supabase, processed.image) : null
  const out: Record<string, unknown> = { [`${prefix}_image_url`]: copy }
  if (prefix !== 'logo') out[`${prefix}_thumbhash`] = processed.thumbhash
  if (prefix === 'backdrop' && processed.image) out.accent_color = await accentColor(processed.image)
  return out
}

/** Llena los campos vacíos de la película o serie con la de TMDB elegida y guarda su id (TMDB-02) */
export async function applyTmdbAction(input: { kind: string; id: string; tmdbId: number }): Promise<TmdbApplyResult> {
  const session = await requireAdmin()
  if (!session) return { error: DENIED }
  const parsed = z.object({ kind: Kind, id: z.uuid(), tmdbId: z.number().int().positive() }).safeParse(input)
  if (!parsed.success) return { error: 'Datos inválidos.' }
  const tmdb = createTmdb()
  if (!tmdb) return { error: TMDB_NOT_CONFIGURED }
  const { kind, id, tmdbId } = parsed.data

  const { data: current } = await session.supabase.from(table(kind)).select('*').eq('id', id).maybeSingle()
  if (!current) return { error: kind === 'movie' ? 'Película no encontrada.' : 'Serie no encontrada.' }

  let details
  try {
    details = kind === 'movie' ? await tmdb.movie(tmdbId) : await tmdb.series(tmdbId)
  } catch (err) {
    console.warn('[TMDB] detalles:', (err as Error).message)
    return { error: UNAVAILABLE }
  }
  if (!details) return { error: 'TMDB ya no tiene ese resultado.' }

  // El título nunca cambia
  const { tmdb_id, ...rest } = details
  const updates: Record<string, unknown> = fillEmpty(current, rest)
  Object.assign(
    updates,
    await imageFields(session.supabase, updates.poster_url as string | undefined, 'poster'),
    await imageFields(session.supabase, updates.backdrop_url as string | undefined, 'backdrop'),
    await imageFields(session.supabase, updates.logo_url as string | undefined, 'logo'),
    { tmdb_id },
  )

  const { error } = await session.supabase.from(table(kind)).update(updates).eq('id', id)
  if (error) {
    console.error('[TMDB] guardar:', error.message)
    return { error: 'No se pudieron guardar los datos de TMDB.' }
  }
  revalidatePath('/dashboard', 'layout')
  const filled = Object.keys(updates).filter((k) => !k.endsWith('_thumbhash') && !k.endsWith('_image_url') && !['tmdb_id', 'accent_color'].includes(k)).length
  return { success: filled ? `Listo: se llenaron ${filled} campo(s) desde TMDB.` : 'Vinculada con TMDB. No había campos vacíos que llenar.' }
}

/** Título, sinopsis e imagen de cada episodio desde TMDB, sin pisar lo escrito (TMDB-03) */
export async function fillEpisodesFromTmdbAction(input: { seriesId: string }): Promise<TmdbApplyResult> {
  const session = await requireAdmin()
  if (!session) return { error: DENIED }
  if (!z.uuid().safeParse(input.seriesId).success) return { error: 'Datos inválidos.' }
  const tmdb = createTmdb()
  if (!tmdb) return { error: TMDB_NOT_CONFIGURED }

  const { data: series } = await session.supabase.from('series').select('tmdb_id').eq('id', input.seriesId).maybeSingle()
  if (!series) return { error: 'Serie no encontrada.' }
  if (!series.tmdb_id) return { error: 'Primero vincula la serie con "Buscar en TMDB".' }

  const { data: episodes } = await session.supabase
    .from('movies')
    .select('id, title, synopsis, poster_url, season_number, episode_number')
    .eq('series_id', input.seriesId)
  const seasons = [...new Set((episodes ?? []).map((e) => e.season_number as number))]

  let updated = 0
  try {
    for (const season of seasons) {
      const fromTmdb = await tmdb.season(series.tmdb_id, season)
      for (const ep of (episodes ?? []).filter((e) => e.season_number === season)) {
        const data = fromTmdb.get(ep.episode_number)
        if (!data) continue
        const updates: Record<string, unknown> = fillEmpty(ep, { synopsis: data.synopsis, poster_url: data.still_url })
        if (data.title && isGenericEpisodeTitle(ep.title)) updates.title = data.title
        if (!Object.keys(updates).length) continue
        Object.assign(updates, await imageFields(session.supabase, updates.poster_url as string | undefined, 'poster'))
        const { error } = await session.supabase.from('movies').update(updates).eq('id', ep.id)
        if (!error) updated++
      }
    }
  } catch (err) {
    console.warn('[TMDB] episodios:', (err as Error).message)
    return { error: updated ? `Se completaron ${updated} episodio(s), pero TMDB dejó de responder.` : UNAVAILABLE }
  }
  revalidatePath('/dashboard', 'layout')
  return { success: updated === 1 ? '1 episodio completado desde TMDB.' : `${updated} episodios completados desde TMDB.` }
}
