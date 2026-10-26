import Link from 'next/link'
import { formatDuration } from '@/lib/movies'
import { progressRatio } from '@/lib/progress'
import type { CatalogMovie } from '@/lib/data/catalog'
import { PosterImage } from './poster-image'

type Props = { movie: CatalogMovie; positionSeconds?: number }

/** Tarjeta de póster (CAT-03). Con `positionSeconds` muestra la barra de "Seguir viendo" (CAT-06). */
export function MovieCard({ movie, positionSeconds }: Props) {
  const ratio = positionSeconds === undefined ? null : progressRatio(positionSeconds, movie.duration_seconds)

  return (
    <Link
      href={`/dashboard/watch/${movie.slug}`}
      className="group block focus-visible:outline-none"
      aria-label={`Ver ${movie.title}`}
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-xl border border-border bg-card transition-transform duration-300 group-hover:scale-[1.03] group-focus-visible:ring-2 group-focus-visible:ring-accent">
        <PosterImage
          src={movie.poster_url}
          thumbhash={movie.poster_thumbhash}
          title={movie.title}
          sizes="(min-width: 1024px) 20vw, (min-width: 768px) 25vw, 50vw"
        />
        {ratio !== null && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/60" role="progressbar" aria-label="Progreso" aria-valuenow={Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-accent" style={{ width: `${ratio * 100}%` }} />
          </div>
        )}
      </div>
      <div className="mt-2 space-y-0.5">
        <h3 className="text-sm font-medium leading-tight text-foreground line-clamp-2">{movie.title}</h3>
        <p className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
          {[movie.release_year, formatDuration(movie.duration_seconds)].filter(Boolean).join(' · ')}
        </p>
      </div>
    </Link>
  )
}
