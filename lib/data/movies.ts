import 'server-only'
import { requireAdmin } from '@/lib/auth/guards'
import type { Movie } from '@/lib/movies'

export type AdminMovie = Movie & { series: { title: string } | null }

/** Todas las películas (borradores incluidos) para el panel, con su serie si son episodios (SER-06). null si no es admin. */
export async function listMoviesForAdmin(): Promise<AdminMovie[] | null> {
  const session = await requireAdmin()
  if (!session) return null

  const { data, error } = await session.supabase
    .from('movies')
    .select('*, series(title)')
    .order('created_at', { ascending: false })
  if (error) throw new Error(`[MOVIES] list failed: ${error.message}`)
  return data as AdminMovie[]
}

export async function getMovieForAdmin(id: string): Promise<Movie | null> {
  const session = await requireAdmin()
  if (!session || !/^[0-9a-f-]{36}$/i.test(id)) return null

  const { data } = await session.supabase.from('movies').select('*').eq('id', id).maybeSingle()
  return (data as Movie | null) ?? null
}
