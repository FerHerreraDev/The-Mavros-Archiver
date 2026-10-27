import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { isInProgress } from '@/lib/progress'
import { nextEpisode, nextUp, seriesContinue, sortEpisodes, type EpisodeProgress } from '@/lib/series'
import type { Movie, Series } from '@/lib/movies'

export type CatalogMovie = Pick<
  Movie,
  'id' | 'slug' | 'title' | 'release_year' | 'duration_seconds' | 'genres' | 'poster_url' | 'poster_image_url' | 'poster_thumbhash' | 'published_at'
>
export type CatalogSeries = Pick<
  Series,
  'id' | 'slug' | 'title' | 'release_year' | 'genres' | 'poster_url' | 'poster_image_url' | 'poster_thumbhash' | 'published_at'
> & { seasons: number; episodes: number }
/** Episodio con lo que necesitan las reglas de series (SER-10..SER-13) */
export type CatalogEpisode = Pick<Movie, 'id' | 'slug' | 'title' | 'duration_seconds' | 'status' | 'synopsis' | 'poster_url' | 'poster_image_url' | 'poster_thumbhash'> & {
  series_id: string
  season: number
  episode: number
  duration: number
}
export type ContinueItem = {
  movie: CatalogMovie
  positionSeconds: number
  updatedAt: string
  /** Si es un episodio: su serie y "T1:E2" (SER-11) */
  episode?: { series: CatalogSeries; season: number; episode: number }
}

const CARD_FIELDS = 'id, slug, title, release_year, duration_seconds, genres, poster_url, poster_image_url, poster_thumbhash, published_at'
const SERIES_FIELDS = 'id, slug, title, release_year, genres, poster_url, poster_image_url, poster_thumbhash, published_at'
const EPISODE_FIELDS = 'id, slug, title, duration_seconds, status, series_id, season_number, episode_number, synopsis, poster_url, poster_image_url, poster_thumbhash'

type EpisodeRow = Pick<Movie, 'id' | 'slug' | 'title' | 'duration_seconds' | 'status' | 'synopsis' | 'poster_url' | 'poster_image_url' | 'poster_thumbhash'> & {
  series_id: string
  season_number: number
  episode_number: number
}
const toEpisode = (e: EpisodeRow): CatalogEpisode => ({
  id: e.id,
  slug: e.slug,
  title: e.title,
  duration_seconds: e.duration_seconds,
  status: e.status,
  synopsis: e.synopsis,
  poster_url: e.poster_url,
  poster_image_url: e.poster_image_url,
  poster_thumbhash: e.poster_thumbhash,
  series_id: e.series_id,
  season: e.season_number,
  episode: e.episode_number,
  duration: e.duration_seconds,
})

/**
 * Catálogo del usuario con sesión. Todo pasa por RLS como ese usuario.
 * Siempre filtra `published` aunque sea admin: los borradores viven en el panel (CAT-01, SER-08).
 */
export async function getCatalog(genre?: string) {
  const supabase = await createClient()

  const [movies, series, episodes, progress] = await Promise.all([
    supabase.from('movies').select(CARD_FIELDS).eq('status', 'published').is('series_id', null).order('published_at', { ascending: false }),
    supabase.from('series').select(SERIES_FIELDS).eq('status', 'published').order('published_at', { ascending: false }),
    supabase.from('movies').select(EPISODE_FIELDS).eq('status', 'published').not('series_id', 'is', null),
    supabase
      .from('watch_progress')
      .select(`position_seconds, updated_at, movies!inner(${CARD_FIELDS}, status, series_id)`)
      .eq('movies.status', 'published')
      .order('updated_at', { ascending: false }),
  ])
  for (const [name, res] of Object.entries({ movies, series, episodes, progress })) {
    if (res.error) throw new Error(`[CATALOG] ${name} failed: ${res.error.message}`)
  }

  // Episodios por serie (solo de series publicadas)
  const episodesBySeries = new Map<string, CatalogEpisode[]>()
  for (const row of (episodes.data ?? []) as EpisodeRow[]) {
    const list = episodesBySeries.get(row.series_id) ?? []
    list.push(toEpisode(row))
    episodesBySeries.set(row.series_id, list)
  }
  const allSeries: CatalogSeries[] = ((series.data ?? []) as Omit<CatalogSeries, 'seasons' | 'episodes'>[])
    .filter((s) => episodesBySeries.has(s.id))
    .map((s) => {
      const list = episodesBySeries.get(s.id)!
      return { ...s, seasons: new Set(list.map((e) => e.season)).size, episodes: list.length }
    })
  const seriesById = new Map(allSeries.map((s) => [s.id, s]))
  const allMovies = (movies.data ?? []) as CatalogMovie[]

  // Seguir viendo: películas a medias (CAT-06) + una entrada por serie (SER-11), por última vez vista
  type ProgressRow = { position_seconds: number; updated_at: string; movies: CatalogMovie & { series_id: string | null } }
  const rows = ((progress.data ?? []) as unknown as ProgressRow[]).map((p) => ({
    ...p,
    movies: (Array.isArray(p.movies) ? p.movies[0] : p.movies) as ProgressRow['movies'],
  }))
  const continueWatching: ContinueItem[] = rows
    .filter((p) => p.movies && p.movies.series_id === null && isInProgress(Number(p.position_seconds), p.movies.duration_seconds))
    .map((p) => ({ movie: p.movies, positionSeconds: Number(p.position_seconds), updatedAt: p.updated_at }))

  const progressBySeries = new Map<string, EpisodeProgress[]>()
  for (const p of rows) {
    if (!p.movies?.series_id || !seriesById.has(p.movies.series_id)) continue
    const list = progressBySeries.get(p.movies.series_id) ?? []
    list.push({ movieId: p.movies.id, position: Number(p.position_seconds), updatedAt: p.updated_at })
    progressBySeries.set(p.movies.series_id, list)
  }
  for (const [seriesId, entries] of progressBySeries) {
    const show = seriesById.get(seriesId)!
    const entry = seriesContinue(episodesBySeries.get(seriesId)!, entries)
    if (!entry) continue
    continueWatching.push({
      movie: {
        ...show,
        id: entry.episode.id,
        slug: entry.episode.slug,
        title: entry.episode.title,
        duration_seconds: entry.episode.duration_seconds,
      },
      positionSeconds: entry.positionSeconds,
      updatedAt: entry.updatedAt,
      episode: { series: show, season: entry.episode.season, episode: entry.episode.episode },
    })
  }
  continueWatching.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))

  const genres = [...new Set([...allMovies, ...allSeries].flatMap((m) => m.genres))].sort((a, b) => a.localeCompare(b, 'es'))
  const byGenre = <T extends { genres: string[] }>(list: T[]) => (genre ? list.filter((m) => m.genres.includes(genre)) : list)

  return { genres, recent: byGenre(allMovies), series: byGenre(allSeries), continueWatching }
}

/**
 * Película o episodio para la página de reproducción + progreso del usuario. null si no la puede ver (WATCH-01, SER-04).
 * Si es episodio trae su serie y el siguiente episodio publicado (SER-12).
 */
export async function getWatchable(slug: string) {
  const supabase = await createClient()
  const { data: movie } = await supabase.from('movies').select('*').eq('slug', slug).maybeSingle()
  if (!movie) return null

  const [{ data: progress }, episodeInfo] = await Promise.all([
    supabase.from('watch_progress').select('position_seconds').eq('movie_id', movie.id).maybeSingle(),
    movie.series_id ? episodeContext(supabase, movie as Movie) : Promise.resolve(null),
  ])

  return { movie: movie as Movie, positionSeconds: progress ? Number(progress.position_seconds) : null, episode: episodeInfo }
}

async function episodeContext(supabase: Awaited<ReturnType<typeof createClient>>, movie: Movie) {
  const [{ data: series }, { data: episodes }] = await Promise.all([
    supabase.from('series').select('slug, title').eq('id', movie.series_id!).maybeSingle(),
    supabase.from('movies').select(EPISODE_FIELDS).eq('series_id', movie.series_id!),
  ])
  if (!series) return null
  // El siguiente solo entre los publicados (un admin en vista previa no salta a otro borrador)
  const list = ((episodes ?? []) as EpisodeRow[]).map(toEpisode).filter((e) => e.status === 'published' || e.id === movie.id)
  return { series, next: nextEpisode(list, movie.id) }
}

/** Serie con sus episodios, el progreso del usuario y "qué sigue" (SER-09, SER-10). null si no la puede ver. */
export async function getSeriesPage(slug: string) {
  const supabase = await createClient()
  const { data: series } = await supabase.from('series').select('*').eq('slug', slug).maybeSingle()
  if (!series) return null

  const { data: rows, error } = await supabase.from('movies').select(EPISODE_FIELDS).eq('series_id', series.id)
  if (error) throw new Error(`[SERIES] episodes failed: ${error.message}`)
  const episodes = sortEpisodes(((rows ?? []) as EpisodeRow[]).map(toEpisode))

  const { data: progressRows } = episodes.length
    ? await supabase.from('watch_progress').select('movie_id, position_seconds, updated_at').in('movie_id', episodes.map((e) => e.id))
    : { data: [] }
  const progress: EpisodeProgress[] = (progressRows ?? []).map((p) => ({
    movieId: p.movie_id,
    position: Number(p.position_seconds),
    updatedAt: p.updated_at,
  }))

  return {
    series: series as Series,
    episodes,
    progress: new Map(progress.map((p) => [p.movieId, p.position])),
    // "Qué sigue" solo entre los publicados: es lo que vería cualquier usuario
    next: nextUp(episodes.filter((e) => e.status === 'published'), progress),
  }
}
