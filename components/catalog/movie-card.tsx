import Link from 'next/link'
import { Play } from 'lucide-react'
import { formatDuration, seriesCount } from '@/lib/movies'
import { progressRatio } from '@/lib/progress'
import { episodeLabel } from '@/lib/series'
import type { CatalogMovie, CatalogSeries, ContinueItem } from '@/lib/data/catalog'
import { PosterImage } from './poster-image'

type Poster = Pick<CatalogMovie, 'poster_url' | 'poster_image_url' | 'poster_thumbhash'>
type CardProps = { href: string; label: string; title: string; meta: string; poster: Poster; ratio?: number | null }

function PosterCard({ href, label, title, meta, poster, ratio = null }: CardProps) {
  return (
    <Link href={href} className="group block focus-visible:outline-none" aria-label={label}>
      <div className="relative aspect-[2/3] overflow-hidden rounded-xl border border-border bg-card shadow-black/60 transition-[transform,box-shadow] duration-300 ease-out group-hover:scale-[1.04] group-hover:shadow-xl group-focus-visible:ring-2 group-focus-visible:ring-accent motion-reduce:transition-none motion-reduce:group-hover:scale-100">
        <PosterImage
          src={poster.poster_image_url ?? poster.poster_url}
          thumbhash={poster.poster_thumbhash}
          title={title}
          sizes="(min-width: 1024px) 20vw, (min-width: 768px) 25vw, 50vw"
        />
        {/* Al pasar el mouse (o con el foco): oscurece y muestra "reproducir" */}
        <div
          aria-hidden
          className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black/75 via-black/15 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          <span className="flex h-11 w-11 scale-75 items-center justify-center rounded-full bg-primary/90 text-primary-foreground shadow-lg transition-transform duration-300 group-hover:scale-100 group-focus-visible:scale-100">
            <Play className="ml-0.5 h-5 w-5 fill-current" />
          </span>
        </div>
        {ratio !== null && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/60" role="progressbar" aria-label="Progreso" aria-valuenow={Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-accent" style={{ width: `${ratio * 100}%` }} />
          </div>
        )}
      </div>
      <div className="mt-2 space-y-0.5">
        <h3 className="text-sm font-medium leading-tight text-foreground line-clamp-2">{title}</h3>
        <p className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground line-clamp-1">{meta}</p>
      </div>
    </Link>
  )
}

type Props = { movie: CatalogMovie; positionSeconds?: number; episode?: ContinueItem['episode'] }

/**
 * Tarjeta de póster (CAT-03). Con `positionSeconds` muestra la barra de "Seguir viendo" (CAT-06).
 * Un episodio en "Seguir viendo" lleva el título de su serie y "T1:E5 · título" (SER-11).
 */
export function MovieCard({ movie, positionSeconds, episode }: Props) {
  const ratio = positionSeconds === undefined ? null : progressRatio(positionSeconds, movie.duration_seconds)
  const href = `/dashboard/watch/${movie.slug}`

  if (episode) {
    const tag = episodeLabel(episode.season, episode.episode)
    return (
      <PosterCard
        href={href}
        label={`Ver ${episode.series.title} ${tag}`}
        title={episode.series.title}
        meta={`${tag} · ${movie.title}`}
        poster={movie}
        ratio={ratio}
      />
    )
  }
  return (
    <PosterCard
      href={href}
      label={`Ver ${movie.title}`}
      title={movie.title}
      meta={[movie.release_year, formatDuration(movie.duration_seconds)].filter(Boolean).join(' · ')}
      poster={movie}
      ratio={ratio}
    />
  )
}

export { seriesCount } from '@/lib/movies'

export function SeriesCard({ series }: { series: CatalogSeries }) {
  return (
    <PosterCard
      href={`/dashboard/series/${series.slug}`}
      label={`Ver serie ${series.title}`}
      title={series.title}
      meta={[series.release_year, seriesCount(series.seasons, series.episodes)].filter(Boolean).join(' · ')}
      poster={series}
    />
  )
}
