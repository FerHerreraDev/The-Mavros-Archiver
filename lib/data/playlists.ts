import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { nextInPlaylist, playlistStart, type ListEntry } from '@/lib/playlist'
import { sortEpisodes, type EpisodeProgress } from '@/lib/series'
import type { CatalogEpisode, CatalogMovie, CatalogSeries } from '@/lib/data/catalog'
import type { Movie } from '@/lib/movies'

export type Playlist = { id: string; name: string; created_at: string }
export type PlaylistSummary = Playlist & { count: number }
/** Lo que se agrega a una lista: una película/episodio o una serie */
export type PlaylistTarget = { movieId: string } | { seriesId: string }
export type PlaylistItem = {
  id: string
  position: number
  movie: (CatalogMovie & Pick<Movie, 'status' | 'series_id' | 'season_number' | 'episode_number'>) | null
  series: Omit<CatalogSeries, 'seasons' | 'episodes'> | null
}

const CARD_FIELDS = 'id, slug, title, release_year, duration_seconds, genres, poster_url, poster_image_url, poster_thumbhash, published_at, status, series_id, season_number, episode_number'
const SERIES_FIELDS = 'id, slug, title, release_year, genres, poster_url, poster_image_url, poster_thumbhash, published_at'

type Supabase = Awaited<ReturnType<typeof createClient>>

/** Mis listas con cuántos elementos tienen (PL-03). RLS: solo las mías. */
export async function listPlaylists(): Promise<PlaylistSummary[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('playlists').select('id, name, created_at, playlist_items(count)').order('created_at')
  if (error) throw new Error(`[LISTS] list failed: ${error.message}`)
  return data.map(({ playlist_items, ...p }) => ({ ...p, count: (playlist_items as { count: number }[])[0]?.count ?? 0 }))
}

/** Mis listas marcando en cuáles ya está [target] (PL-04) */
export async function playlistMembership(target: PlaylistTarget) {
  const supabase = await createClient()
  const column = 'movieId' in target ? 'movie_id' : 'series_id'
  const id = 'movieId' in target ? target.movieId : target.seriesId
  const [{ data: lists }, { data: items }] = await Promise.all([
    supabase.from('playlists').select('id, name').order('created_at'),
    supabase.from('playlist_items').select('playlist_id').eq(column, id),
  ])
  const inLists = new Set((items ?? []).map((i) => i.playlist_id))
  return (lists ?? []).map((l) => ({ id: l.id as string, name: l.name as string, contains: inLists.has(l.id) }))
}

async function loadItems(supabase: Supabase, playlistId: string): Promise<PlaylistItem[]> {
  const { data, error } = await supabase
    .from('playlist_items')
    .select(`id, position, movie:movies(${CARD_FIELDS}), series:series(${SERIES_FIELDS})`)
    .eq('playlist_id', playlistId)
    .order('position')
  if (error) throw new Error(`[LISTS] items failed: ${error.message}`)
  // RLS: lo que dejó de estar publicado llega como null y no se muestra (PL-05)
  return (data as unknown as PlaylistItem[]).filter((i) => (i.movie && i.movie.status === 'published') || i.series)
}

const toEpisode = (m: Record<string, unknown>): CatalogEpisode => ({
  id: m.id as string,
  slug: m.slug as string,
  title: m.title as string,
  duration_seconds: m.duration_seconds as number,
  status: m.status as CatalogEpisode['status'],
  series_id: (m.series_id as string) ?? '',
  season: (m.season_number as number) ?? 0,
  episode: (m.episode_number as number) ?? 0,
  duration: m.duration_seconds as number,
})

/** Elementos resueltos para las reglas: episodios publicados de cada serie y el progreso del usuario */
async function resolve(supabase: Supabase, items: PlaylistItem[]) {
  const seriesIds = items.flatMap((i) => (i.series ? [i.series.id] : []))
  const { data: episodeRows } = seriesIds.length
    ? await supabase.from('movies').select(CARD_FIELDS).in('series_id', seriesIds).eq('status', 'published')
    : { data: [] }
  const episodes = (episodeRows ?? []).map(toEpisode)
  const ids = [...items.flatMap((i) => (i.movie ? [i.movie.id] : [])), ...episodes.map((e) => e.id)]
  const { data: progressRows } = ids.length
    ? await supabase.from('watch_progress').select('movie_id, position_seconds, updated_at').in('movie_id', ids)
    : { data: [] }
  const progress: EpisodeProgress[] = (progressRows ?? []).map((p) => ({ movieId: p.movie_id, position: Number(p.position_seconds), updatedAt: p.updated_at }))
  const entries: ListEntry<CatalogEpisode>[] = items.map((i) =>
    i.movie
      ? { movie: toEpisode(i.movie as unknown as Record<string, unknown>) }
      : { seriesId: i.series!.id, episodes: sortEpisodes(episodes.filter((e) => e.series_id === i.series!.id)) }
  )
  return { entries, progress }
}

/** Una lista mía con sus elementos y qué reproduce "Reproducir lista" (PL-05). null si no es mía o no existe. */
export async function getPlaylist(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const supabase = await createClient()
  const { data: playlist } = await supabase.from('playlists').select('id, name, created_at').eq('id', id).maybeSingle()
  if (!playlist) return null
  const items = await loadItems(supabase, id)
  const { entries, progress } = await resolve(supabase, items)
  return { playlist: playlist as Playlist, items, start: playlistStart(entries, progress) }
}

/** Al reproducir desde la lista: qué sigue después de [movieId] (PL-06). null si no hay o la lista no es mía. */
export async function nextFromPlaylist(playlistId: string, movieId: string): Promise<{ next: CatalogEpisode; playlist: Playlist } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(playlistId)) return null
  const supabase = await createClient()
  const { data: playlist } = await supabase.from('playlists').select('id, name, created_at').eq('id', playlistId).maybeSingle()
  if (!playlist) return null
  const { entries, progress } = await resolve(supabase, await loadItems(supabase, playlistId))
  const pick = nextInPlaylist(entries, movieId, progress)
  return pick ? { next: pick.episode, playlist: playlist as Playlist } : null
}
