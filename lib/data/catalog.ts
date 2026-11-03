import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { isInProgress } from '@/lib/progress'
import { nextEpisode, nextUp, seriesContinue, sortEpisodes, type EpisodeProgress } from '@/lib/series'
import { formatDuration, seriesCount, similarTitles, type Movie, type Series } from '@/lib/movies'

export type CatalogMovie = Pick<
  Movie,
  'id' | 'slug' | 'title' | 'original_title' | 'release_year' | 'duration_seconds' | 'genres' | 'poster_url' | 'poster_image_url' | 'poster_thumbhash' | 'published_at'
>
export type CatalogSeries = Pick<
  Series,
  'id' | 'slug' | 'title' | 'original_title' | 'release_year' | 'genres' | 'poster_url' | 'poster_image_url' | 'poster_thumbhash' | 'published_at'
> & { seasons: number; episodes: number }
/** Episodio con lo que necesitan las reglas de series (SER-10..SER-13) */
export type CatalogEpisode = Pick<Movie, 'id' | 'slug' | 'title' | 'duration_seconds' | 'status' | 'synopsis' | 'poster_url' | 'poster_image_url' | 'poster_thumbhash'> & {
  series_id: string
  season: number
  episode: number
  duration: number
}
/** Destacada de la portada (CAT-07): película o serie con imagen horizontal */
export type FeaturedItem = {
  kind: 'movie' | 'series'
  id: string
  href: string
  /** Detalle de la película (CAT-09); una serie ya abre su página con href */
  infoHref: string | null
  title: string
  meta: string[]
  synopsis: string | null
  backdrop: string
  backdropThumbhash: string | null
  logo: string | null
  accent: string | null
  publishedAt: string
}
export type ContinueItem = {
  movie: CatalogMovie
  positionSeconds: number
  updatedAt: string
  /** Si es un episodio: su serie y "T1:E2" (SER-11) */
  episode?: { series: CatalogSeries; season: number; episode: number }
}

const CARD_FIELDS = 'id, slug, title, original_title, release_year, duration_seconds, genres, poster_url, poster_image_url, poster_thumbhash, published_at'
const SERIES_FIELDS = 'id, slug, title, original_title, release_year, genres, poster_url, poster_image_url, poster_thumbhash, published_at'
const HERO_FIELDS =
  'id, slug, title, release_year, genres, synopsis, backdrop_url, backdrop_image_url, backdrop_thumbhash, logo_url, logo_image_url, accent_color, published_at'
/** Cuántas destacadas rota la portada (CAT-07) */
export const FEATURED_MAX = 5
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

  const [movies, series, episodes, progress, heroMovies, heroSeries] = await Promise.all([
    supabase.from('movies').select(CARD_FIELDS).eq('status', 'published').is('series_id', null).order('published_at', { ascending: false }),
    supabase.from('series').select(SERIES_FIELDS).eq('status', 'published').order('published_at', { ascending: false }),
    supabase.from('movies').select(EPISODE_FIELDS).eq('status', 'published').not('series_id', 'is', null),
    supabase
      .from('watch_progress')
      .select(`position_seconds, updated_at, movies!inner(${CARD_FIELDS}, status, series_id)`)
      .eq('movies.status', 'published')
      .order('updated_at', { ascending: false }),
    supabase
      .from('movies')
      .select(`${HERO_FIELDS}, duration_seconds`)
      .eq('status', 'published')
      .is('series_id', null)
      .not('backdrop_url', 'is', null)
      .order('published_at', { ascending: false })
      .limit(FEATURED_MAX),
    supabase
      .from('series')
      .select(HERO_FIELDS)
      .eq('status', 'published')
      .not('backdrop_url', 'is', null)
      .order('published_at', { ascending: false })
      .limit(FEATURED_MAX),
  ])
  for (const [name, res] of Object.entries({ movies, series, episodes, progress, heroMovies, heroSeries })) {
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

  // Destacadas: las más recientes con imagen horizontal; una serie solo si ya tiene episodios (CAT-07)
  type HeroRow = Pick<Movie, 'id' | 'slug' | 'title' | 'release_year' | 'genres' | 'synopsis' | 'backdrop_url' | 'backdrop_image_url' | 'backdrop_thumbhash' | 'logo_url' | 'logo_image_url' | 'accent_color'> & {
    published_at: string
    duration_seconds?: number
  }
  const hero = (row: HeroRow, kind: FeaturedItem['kind'], extra: string | null): FeaturedItem => ({
    kind,
    id: row.id,
    href: kind === 'movie' ? `/dashboard/watch/${row.slug}` : `/dashboard/series/${row.slug}`,
    infoHref: kind === 'movie' ? `/dashboard/movie/${row.slug}` : null,
    title: row.title,
    meta: [row.release_year ? String(row.release_year) : null, extra, ...row.genres.slice(0, 3)].filter((v): v is string => !!v),
    synopsis: row.synopsis,
    backdrop: (row.backdrop_image_url ?? row.backdrop_url)!,
    backdropThumbhash: row.backdrop_thumbhash,
    logo: row.logo_image_url ?? row.logo_url,
    accent: row.accent_color,
    publishedAt: row.published_at,
  })
  const featured = [
    ...((heroMovies.data ?? []) as HeroRow[]).map((m) => hero(m, 'movie', m.duration_seconds ? formatDuration(m.duration_seconds) : null)),
    ...((heroSeries.data ?? []) as HeroRow[])
      .filter((s) => seriesById.has(s.id))
      .map((s) => {
        const show = seriesById.get(s.id)!
        return hero(s, 'series', seriesCount(show.seasons, show.episodes))
      }),
  ]
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, FEATURED_MAX)

  return { genres, recent: byGenre(allMovies), series: byGenre(allSeries), continueWatching, featured }
}

/**
 * Detalle de una película (CAT-09, CAT-10): la película, el progreso del usuario y "Más como esta".
 * null si no la puede ver o si es un episodio (los episodios viven en su serie).
 */
export async function getMovieDetail(slug: string) {
  const supabase = await createClient()
  const { data } = await supabase.from('movies').select('*').eq('slug', slug).is('series_id', null).maybeSingle()
  if (!data) return null
  const movie = data as Movie

  const [{ data: progress }, { data: candidates, error }] = await Promise.all([
    supabase.from('watch_progress').select('position_seconds').eq('movie_id', movie.id).maybeSingle(),
    movie.genres.length
      ? supabase.from('movies').select(CARD_FIELDS).eq('status', 'published').is('series_id', null).overlaps('genres', movie.genres)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (error) throw new Error(`[DETAIL] similar failed: ${error.message}`)

  return {
    movie,
    positionSeconds: progress ? Number(progress.position_seconds) : null,
    similar: similarTitles(movie, (candidates ?? []) as CatalogMovie[]),
  }
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
