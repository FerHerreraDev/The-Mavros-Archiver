'use server'

import { z } from 'zod'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/guards'
import { seriesFormSchema } from '@/lib/movies'
import { BACKDROP_MAX_WIDTH, processPoster, uploadPoster } from '@/lib/poster/thumbhash'
import type { MovieActionResult } from '@/lib/actions/movie.actions'

const SERIES_PATH = '/dashboard/admin/series'
const DENIED = 'Acceso denegado. Se requieren privilegios de administrador.'
const NOT_FOUND = 'Serie no encontrada.'
const FIELDS = ['title', 'slug', 'original_title', 'synopsis', 'release_year', 'genres', 'poster_url', 'backdrop_url'] as const
const IdSchema = z.uuid()

function dbError(error: { code?: string; message: string }): MovieActionResult {
  if (error.code === '23505') {
    return { error: 'Ya existe una serie con ese slug.', fieldErrors: { slug: ['Ya existe una serie con ese slug'] } }
  }
  console.error('[SERIES] Error de base de datos:', error.message)
  return { error: 'No se pudo guardar la serie.' }
}

/** Valida el formulario y prepara el póster como en las películas (SER-05, LOAD-03, LOAD-07) */
async function prepare(formData: FormData, supabase: Parameters<typeof uploadPoster>[0]) {
  const raw = Object.fromEntries(FIELDS.map((f) => [f, String(formData.get(f) ?? '')]))
  const parsed = seriesFormSchema.safeParse(raw)
  if (!parsed.success) {
    return { result: { error: 'Revisa los campos marcados.', fieldErrors: z.flattenError(parsed.error).fieldErrors } }
  }
  const [poster, backdrop] = await Promise.all([
    processPoster(parsed.data.poster_url),
    processPoster(parsed.data.backdrop_url, undefined, BACKDROP_MAX_WIDTH),
  ])
  const [poster_image_url, backdrop_image_url] = await Promise.all([
    poster.image ? uploadPoster(supabase, poster.image) : null,
    backdrop.image ? uploadPoster(supabase, backdrop.image) : null,
  ])
  return {
    data: { ...parsed.data, poster_thumbhash: poster.thumbhash, poster_image_url, backdrop_thumbhash: backdrop.thumbhash, backdrop_image_url },
  }
}

export async function createSeriesAction(formData: FormData): Promise<MovieActionResult> {
  const session = await requireAdmin()
  if (!session) return { error: DENIED }

  const prepared = await prepare(formData, session.supabase)
  if (!prepared.data) return prepared.result

  const { data, error } = await session.supabase.from('series').insert({ ...prepared.data, status: 'draft' }).select('id').single()
  if (error) return dbError(error)

  revalidatePath(SERIES_PATH)
  redirect(`${SERIES_PATH}/${data.id}/edit`)
}

export async function updateSeriesAction(id: string, formData: FormData): Promise<MovieActionResult> {
  const session = await requireAdmin()
  if (!session) return { error: DENIED }
  if (!IdSchema.safeParse(id).success) return { error: NOT_FOUND }

  const prepared = await prepare(formData, session.supabase)
  if (!prepared.data) return prepared.result

  const { data, error } = await session.supabase.from('series').update(prepared.data).eq('id', id).select('id')
  if (error) return dbError(error)
  if (!data?.length) return { error: NOT_FOUND }

  revalidatePath(SERIES_PATH, 'layout')
  redirect(SERIES_PATH)
}

export async function setSeriesStatusAction(input: { id: string; status: string }): Promise<MovieActionResult> {
  const session = await requireAdmin()
  if (!session) return { error: DENIED }

  const parsed = z.object({ id: IdSchema, status: z.enum(['draft', 'published']) }).safeParse(input)
  if (!parsed.success) return { error: 'Datos inválidos.' }

  const { data, error } = await session.supabase
    .from('series')
    .update({ status: parsed.data.status })
    .eq('id', parsed.data.id)
    .select('title')
  if (error) return dbError(error)
  if (!data?.length) return { error: NOT_FOUND }

  revalidatePath(SERIES_PATH, 'layout')
  return { success: `"${data[0].title}" ${parsed.data.status === 'published' ? 'publicada' : 'pasó a borrador'}.` }
}

/** Borra la serie y sus episodios (cascada); los archivos en R2 no se tocan (SER-03, SER-05) */
export async function deleteSeriesAction(input: { id: string }): Promise<MovieActionResult> {
  const session = await requireAdmin()
  if (!session) return { error: DENIED }
  if (!IdSchema.safeParse(input.id).success) return { error: 'Datos inválidos.' }

  const { data, error } = await session.supabase.from('series').delete().eq('id', input.id).select('title')
  if (error) return dbError(error)
  if (!data?.length) return { error: NOT_FOUND }

  revalidatePath(SERIES_PATH, 'layout')
  revalidatePath('/dashboard/admin/movies')
  return { success: `"${data[0].title}" borrada con sus episodios.` }
}

/** Publica de una vez todos los episodios en borrador de la serie (SER-07) */
export async function publishSeriesDraftsAction(input: { id: string }): Promise<MovieActionResult> {
  const session = await requireAdmin()
  if (!session) return { error: DENIED }
  if (!IdSchema.safeParse(input.id).success) return { error: 'Datos inválidos.' }

  const { data, error } = await session.supabase
    .from('movies')
    .update({ status: 'published' })
    .eq('series_id', input.id)
    .eq('status', 'draft')
    .select('id')
  if (error) return dbError(error)

  revalidatePath(SERIES_PATH, 'layout')
  revalidatePath('/dashboard/admin/movies')
  const n = data?.length ?? 0
  return { success: n === 1 ? '1 episodio publicado.' : `${n} episodios publicados.` }
}
