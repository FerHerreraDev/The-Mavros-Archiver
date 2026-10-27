import 'server-only'
import { requireAdmin } from '@/lib/auth/guards'
import { sortEpisodes } from '@/lib/series'
import type { Movie, Series } from '@/lib/movies'

export type AdminSeries = Series & { episode_count: number }
export type SeriesOption = Pick<Series, 'id' | 'title' | 'slug'>
export type AdminEpisode = Pick<Movie, 'id' | 'slug' | 'title' | 'status'> & { season: number; episode: number; duration: number }

/** Todas las series (borradores incluidos) con su número de episodios. null si no es admin (SER-05). */
export async function listSeriesForAdmin(): Promise<AdminSeries[] | null> {
  const session = await requireAdmin()
  if (!session) return null

  const { data, error } = await session.supabase.from('series').select('*, movies(count)').order('created_at', { ascending: false })
  if (error) throw new Error(`[SERIES] list failed: ${error.message}`)
  return data.map(({ movies, ...series }) => ({ ...(series as Series), episode_count: (movies as { count: number }[])[0]?.count ?? 0 }))
}

/** Para el selector "Serie" del formulario de película (SER-06) */
export async function listSeriesOptions(): Promise<SeriesOption[]> {
  const session = await requireAdmin()
  if (!session) return []
  const { data } = await session.supabase.from('series').select('id, title, slug').order('title')
  return data ?? []
}

/** Serie + episodios en orden (SER-07) */
export async function getSeriesForAdmin(id: string) {
  const session = await requireAdmin()
  if (!session || !/^[0-9a-f-]{36}$/i.test(id)) return null

  const [{ data: series }, { data: episodes }] = await Promise.all([
    session.supabase.from('series').select('*').eq('id', id).maybeSingle(),
    session.supabase.from('movies').select('id, slug, title, status, duration_seconds, season_number, episode_number').eq('series_id', id),
  ])
  if (!series) return null

  const list: AdminEpisode[] = (episodes ?? []).map((e) => ({
    id: e.id,
    slug: e.slug,
    title: e.title,
    status: e.status,
    season: e.season_number,
    episode: e.episode_number,
    duration: e.duration_seconds,
  }))
  return { series: series as Series, episodes: sortEpisodes(list) }
}
