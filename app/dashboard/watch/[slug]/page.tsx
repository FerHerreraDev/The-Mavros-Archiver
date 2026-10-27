import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getWatchable } from '@/lib/data/catalog'
import { playbackUrl } from '@/lib/video/playback'
import { resumePosition } from '@/lib/progress'
import { formatDuration } from '@/lib/movies'
import { episodeLabel } from '@/lib/series'
import { MoviePlayer } from '@/components/player/movie-player'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const watchable = await getWatchable((await params).slug)
  return { title: watchable ? `${watchable.movie.title} - The Mavros Archiver` : 'The Mavros Archiver' }
}

export default async function WatchPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  // RLS: publicada para cualquiera, borrador solo para admins; si no, 404 (WATCH-01)
  const watchable = await getWatchable(slug)
  if (!watchable) notFound()

  const { movie, positionSeconds, episode } = watchable
  const next = episode?.next
    ? { slug: episode.next.slug, title: episode.next.title, label: episodeLabel(episode.next.season, episode.next.episode) }
    : null
  const { url, expiresAt } = await playbackUrl(movie.hls_path)

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <Link
        href={episode ? `/dashboard/series/${episode.series.slug}` : '/dashboard'}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {episode ? episode.series.title : 'Catálogo'}
      </Link>

      {/* key: al pasar al siguiente episodio el reproductor arranca de cero (token, progreso) */}
      <MoviePlayer
        key={movie.id}
        movieId={movie.id}
        title={movie.title}
        poster={movie.poster_image_url ?? movie.poster_url}
        initialUrl={url}
        initialExpiresAt={expiresAt}
        startAt={resumePosition(positionSeconds, movie.duration_seconds)}
        next={next}
      />

      <section className="max-w-3xl space-y-3">
        {episode && movie.season_number !== null && (
          <p className="text-sm text-muted-foreground">
            <Link href={`/dashboard/series/${episode.series.slug}`} className="font-medium text-foreground hover:underline">
              {episode.series.title}
            </Link>
            {' · '}
            {movie.season_number === 0 ? 'Especiales' : `Temporada ${movie.season_number}`} · Episodio {movie.episode_number}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{movie.title}</h1>
          {movie.status === 'draft' && (
            <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
              Borrador · vista previa
            </span>
          )}
        </div>
        {movie.original_title && <p className="text-sm text-muted-foreground">{movie.original_title}</p>}
        <p className="text-xs font-mono uppercase tracking-wide text-muted-foreground">
          {[movie.release_year, formatDuration(movie.duration_seconds), ...movie.genres].filter(Boolean).join(' · ')}
        </p>
        {movie.synopsis && <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-line">{movie.synopsis}</p>}
      </section>
    </div>
  )
}
