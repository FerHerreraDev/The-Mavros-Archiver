'use server'

import { z } from 'zod'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/guards'
import { movieFormSchema } from '@/lib/movies'
import { probeHlsMaster } from '@/lib/hls/remote'
import { signedVideoBase } from '@/lib/video/playback'
import { computePosterThumbhash } from '@/lib/poster/thumbhash'

const MOVIES_PATH = '/dashboard/admin/movies'
const DENIED = 'Acceso denegado. Se requieren privilegios de administrador.'

export type MovieActionResult = {
  success?: string
  error?: string
  fieldErrors?: Partial<Record<string, string[]>>
}

const FIELDS = ['title', 'slug', 'original_title', 'synopsis', 'release_year', 'genres', 'poster_url', 'hls_path'] as const
const IdSchema = z.uuid()

/**
 * Valida el formulario y verifica el video en R2 (MOV-07, MOV-08).
 * Devuelve los datos listos para guardar o el error a mostrar.
 */
async function prepare(formData: FormData) {
  const raw = Object.fromEntries(FIELDS.map((f) => [f, String(formData.get(f) ?? '')]))
  const parsed = movieFormSchema.safeParse(raw)
  if (!parsed.success) {
    return { result: { error: 'Revisa los campos marcados.', fieldErrors: z.flattenError(parsed.error).fieldErrors } }
  }

  // El bucket es privado: se verifica a través del Worker con un token corto (PLY-09)
  let base: string
  try {
    base = (await signedVideoBase(parsed.data.hls_path, 5 * 60)).base
  } catch (err) {
    const message = (err as Error).message
    const fieldErrors = message.includes('carpeta') ? { hls_path: [message] } : undefined
    return { result: { error: fieldErrors ? 'Revisa los campos marcados.' : message, fieldErrors } }
  }

  // En paralelo: la vista previa del póster nunca bloquea ni hace fallar el guardado (LOAD-03)
  const [probe, poster_thumbhash] = await Promise.all([
    probeHlsMaster(base, parsed.data.hls_path),
    computePosterThumbhash(parsed.data.poster_url),
  ])
  if (!probe.ok) {
    return { result: { error: 'No se pudo verificar el video.', fieldErrors: { hls_path: [probe.error] } } }
  }

  return { data: { ...parsed.data, duration_seconds: probe.durationSeconds, poster_thumbhash } }
}

function dbError(error: { code?: string; message: string }): MovieActionResult {
  if (error.code === '23505') {
    return { error: 'Ya existe una película con ese slug.', fieldErrors: { slug: ['Ya existe una película con ese slug'] } }
  }
  console.error('[MOVIES] Error de base de datos:', error.message)
  return { error: 'No se pudo guardar la película.' }
}

export async function createMovieAction(formData: FormData): Promise<MovieActionResult> {
  const session = await requireAdmin()
  if (!session) return { error: DENIED }

  const prepared = await prepare(formData)
  if (!prepared.data) return prepared.result

  // Cliente con la sesión del admin: RLS vuelve a exigir is_admin() y fija created_by
  const { error } = await session.supabase.from('movies').insert({ ...prepared.data, status: 'draft' })
  if (error) return dbError(error)

  revalidatePath(MOVIES_PATH)
  redirect(MOVIES_PATH)
}

export async function updateMovieAction(id: string, formData: FormData): Promise<MovieActionResult> {
  const session = await requireAdmin()
  if (!session) return { error: DENIED }
  if (!IdSchema.safeParse(id).success) return { error: 'Película no encontrada.' }

  const prepared = await prepare(formData)
  if (!prepared.data) return prepared.result

  const { data, error } = await session.supabase.from('movies').update(prepared.data).eq('id', id).select('id')
  if (error) return dbError(error)
  if (!data?.length) return { error: 'Película no encontrada.' }

  revalidatePath(MOVIES_PATH)
  redirect(MOVIES_PATH)
}

export async function setMovieStatusAction(input: { id: string; status: string }): Promise<MovieActionResult> {
  const session = await requireAdmin()
  if (!session) return { error: DENIED }

  const parsed = z.object({ id: IdSchema, status: z.enum(['draft', 'published']) }).safeParse(input)
  if (!parsed.success) return { error: 'Datos inválidos.' }

  const { data, error } = await session.supabase
    .from('movies')
    .update({ status: parsed.data.status })
    .eq('id', parsed.data.id)
    .select('title')
  if (error) return dbError(error)
  if (!data?.length) return { error: 'Película no encontrada.' }

  revalidatePath(MOVIES_PATH)
  return { success: `"${data[0].title}" ${parsed.data.status === 'published' ? 'publicada' : 'pasó a borrador'}.` }
}

/** Borra la fila. Los archivos en R2 no se tocan (MOV-11). */
export async function deleteMovieAction(input: { id: string }): Promise<MovieActionResult> {
  const session = await requireAdmin()
  if (!session) return { error: DENIED }
  if (!IdSchema.safeParse(input.id).success) return { error: 'Datos inválidos.' }

  const { data, error } = await session.supabase.from('movies').delete().eq('id', input.id).select('title')
  if (error) return dbError(error)
  if (!data?.length) return { error: 'Película no encontrada.' }

  revalidatePath(MOVIES_PATH)
  return { success: `"${data[0].title}" borrada.` }
}
