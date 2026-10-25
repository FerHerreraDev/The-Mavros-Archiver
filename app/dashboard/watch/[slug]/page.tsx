import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getWatchable } from '@/lib/data/catalog'
import { playbackUrl } from '@/lib/video/playback'
import { resumePosition } from '@/lib/progress'
import { formatDuration } from '@/lib/movies'
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

  const { movie, positionSeconds } = watchable
  const { url, expiresAt } = await playbackUrl(movie.hls_path)

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Catálogo
      </Link>

      <MoviePlayer
        movieId={movie.id}
        title={movie.title}
        poster={movie.poster_url}
        initialUrl={url}
        initialExpiresAt={expiresAt}
        startAt={resumePosition(positionSeconds, movie.duration_seconds)}
      />

      <section className="max-w-3xl space-y-3">
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
