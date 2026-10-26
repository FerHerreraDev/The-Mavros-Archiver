import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { isInProgress } from '@/lib/progress'
import type { Movie } from '@/lib/movies'

export type CatalogMovie = Pick<
  Movie,
  'id' | 'slug' | 'title' | 'release_year' | 'duration_seconds' | 'genres' | 'poster_url' | 'poster_thumbhash' | 'published_at'
>
export type ContinueItem = { movie: CatalogMovie; positionSeconds: number; updatedAt: string }

const CARD_FIELDS = 'id, slug, title, release_year, duration_seconds, genres, poster_url, poster_thumbhash, published_at'

/**
 * Catálogo del usuario con sesión. Todo pasa por RLS como ese usuario.
 * Siempre filtra `published` aunque sea admin: los borradores viven en el panel (CAT-01).
 */
export async function getCatalog(genre?: string) {
  const supabase = await createClient()

  const [{ data: published, error }, { data: progress, error: progressError }] = await Promise.all([
    supabase.from('movies').select(CARD_FIELDS).eq('status', 'published').order('published_at', { ascending: false }),
    supabase
      .from('watch_progress')
      .select(`position_seconds, updated_at, movies!inner(${CARD_FIELDS}, status)`)
      .eq('movies.status', 'published')
      .order('updated_at', { ascending: false }),
  ])
  if (error) throw new Error(`[CATALOG] movies failed: ${error.message}`)
  if (progressError) throw new Error(`[CATALOG] progress failed: ${progressError.message}`)

  const movies = (published ?? []) as CatalogMovie[]
  const genres = [...new Set(movies.flatMap((m) => m.genres))].sort((a, b) => a.localeCompare(b, 'es'))

  const continueWatching: ContinueItem[] = (progress ?? [])
    .map((p) => {
      const movie = (Array.isArray(p.movies) ? p.movies[0] : p.movies) as CatalogMovie
      return { movie, positionSeconds: Number(p.position_seconds), updatedAt: p.updated_at as string }
    })
    .filter((item) => item.movie && isInProgress(item.positionSeconds, item.movie.duration_seconds))

  return {
    genres,
    recent: genre ? movies.filter((m) => m.genres.includes(genre)) : movies,
    continueWatching,
  }
}

/** Película para la página de reproducción + progreso del usuario. null si no la puede ver (WATCH-01). */
export async function getWatchable(slug: string) {
  const supabase = await createClient()
  const { data: movie } = await supabase.from('movies').select('*').eq('slug', slug).maybeSingle()
  if (!movie) return null

  const { data: progress } = await supabase
    .from('watch_progress')
    .select('position_seconds')
    .eq('movie_id', movie.id)
    .maybeSingle()

  return { movie: movie as Movie, positionSeconds: progress ? Number(progress.position_seconds) : null }
}
