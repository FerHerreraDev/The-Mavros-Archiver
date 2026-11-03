import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Play, UserRound } from 'lucide-react'
import { getMovieDetail } from '@/lib/data/catalog'
import { formatDuration, formatTimestamp } from '@/lib/movies'
import { isInProgress, progressRatio, resumePosition } from '@/lib/progress'
import { playlistMembership } from '@/lib/data/playlists'
import { PosterImage } from '@/components/catalog/poster-image'
import { MovieCard } from '@/components/catalog/movie-card'
import { CatalogRow } from '@/components/catalog/catalog-row'
import { TrailerButton } from '@/components/catalog/trailer-button'
import { AddToList } from '@/components/lists/add-to-list'
import { cn } from '@/lib/utils'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const detail = await getMovieDetail((await params).slug)
  return { title: detail ? `${detail.movie.title} - The Mavros Archiver` : 'The Mavros Archiver' }
}

/** Detalle de una película (CAT-09, CAT-10): portada, tráiler, reparto y "Más como esta" */
export default async function MoviePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  // RLS: publicada para cualquiera, borrador solo para admins; si no, 404 (como WATCH-01)
  const detail = await getMovieDetail(slug)
  if (!detail) notFound()

  const { movie, positionSeconds, similar } = detail
  const lists = await playlistMembership({ movieId: movie.id })
  const resumeAt = resumePosition(positionSeconds, movie.duration_seconds)
  const inProgress = positionSeconds !== null && isInProgress(positionSeconds, movie.duration_seconds)
  // Sin imagen horizontal, el póster borroso de fondo (como SER-17)
  const backdrop = movie.backdrop_image_url ?? movie.backdrop_url
  const background = backdrop
    ? { src: backdrop, thumbhash: movie.backdrop_thumbhash }
    : { src: movie.poster_image_url ?? movie.poster_url, thumbhash: movie.poster_thumbhash }
  const logo = movie.logo_image_url ?? movie.logo_url

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <section className="relative -mx-4 -mt-8 overflow-hidden sm:-mx-6 sm:rounded-b-3xl">
        <div className={cn('absolute inset-0', backdrop ? 'ken-burns' : 'scale-110 blur-2xl opacity-60')} aria-hidden="true">
          <PosterImage src={background.src} thumbhash={background.thumbhash} title="" sizes="100vw" />
        </div>
        {movie.accent_color && (
          <div
            aria-hidden
            data-testid="detail-accent"
            className="absolute inset-0 mix-blend-soft-light"
            style={{ background: `radial-gradient(120% 100% at 0% 100%, ${movie.accent_color} 0%, transparent 65%)` }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/10 sm:bg-gradient-to-r sm:from-background sm:via-background/75 sm:to-transparent" />

        <div className="relative flex min-h-[460px] flex-col justify-end gap-4 px-4 pb-8 pt-24 sm:min-h-[560px] sm:px-10 sm:pb-12 md:max-w-[65%]">
          <Link href="/dashboard" className="absolute left-4 top-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground sm:left-10">
            <ArrowLeft className="h-4 w-4" /> Catálogo
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-4xl font-black tracking-tight sm:text-6xl">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element -- logo con transparencia, tamaño natural acotado
                <img src={logo} alt={movie.title} className="max-h-24 w-auto max-w-[85%] object-contain object-left drop-shadow-[0_4px_24px_rgba(0,0,0,0.65)] sm:max-h-36" />
              ) : (
                movie.title
              )}
            </h1>
            {movie.status === 'draft' && (
              <span className="rounded-full border border-border bg-background/60 px-2.5 py-0.5 text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
                Borrador · vista previa
              </span>
            )}
          </div>
          {/* El título original solo si dice algo distinto (el logo puede traer el título en otro idioma) */}
          {movie.original_title && movie.original_title.toLowerCase() !== movie.title.toLowerCase() && (
            <p className="text-sm text-muted-foreground">{movie.original_title}</p>
          )}
          <p className="text-xs font-mono uppercase tracking-wide text-foreground/80">
            {[movie.release_year, formatDuration(movie.duration_seconds), ...movie.genres].filter(Boolean).join(' · ')}
          </p>
          {movie.synopsis && <p className="line-clamp-5 max-w-2xl text-sm leading-relaxed text-foreground/90 sm:text-base">{movie.synopsis}</p>}

          {inProgress && (
            <div className="flex max-w-sm items-center gap-3 text-xs text-muted-foreground">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-foreground/20" role="progressbar" aria-label="Progreso" aria-valuenow={Math.round(progressRatio(positionSeconds!, movie.duration_seconds) * 100)} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full bg-accent" style={{ width: `${progressRatio(positionSeconds!, movie.duration_seconds) * 100}%` }} />
              </div>
              Quedan {formatDuration(Math.max(60, movie.duration_seconds - positionSeconds!))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Link
              href={`/dashboard/watch/${movie.slug}`}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.03] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
            >
              <Play className="h-4 w-4 fill-current" />
              {resumeAt > 0 ? `Continuar desde ${formatTimestamp(resumeAt)}` : 'Reproducir'}
            </Link>
            {movie.trailer_key && <TrailerButton trailerKey={movie.trailer_key} title={movie.title} />}
            <AddToList target={{ movieId: movie.id }} lists={lists} />
          </div>
        </div>
      </section>

      {movie.cast.length > 0 && (
        <CatalogRow id="cast" title="Reparto" compact>
          {movie.cast.map((person) => (
            <figure key={`${person.name}-${person.character}`} className="space-y-2 text-center">
              <div className="relative mx-auto aspect-square w-full overflow-hidden rounded-full border border-border bg-card">
                {person.profile_url ? (
                  <PosterImage src={person.profile_url} thumbhash={null} title={person.name} sizes="128px" />
                ) : (
                  <UserRound className="absolute inset-0 m-auto h-1/2 w-1/2 text-muted-foreground" aria-hidden />
                )}
              </div>
              <figcaption className="space-y-0.5">
                <p className="text-sm font-medium leading-tight text-foreground line-clamp-2">{person.name}</p>
                {person.character && <p className="text-xs text-muted-foreground line-clamp-2">{person.character}</p>}
              </figcaption>
            </figure>
          ))}
        </CatalogRow>
      )}

      {similar.length > 0 && (
        <CatalogRow id="similar" title="Más como esta">
          {similar.map((m) => (
            <MovieCard key={m.id} movie={m} />
          ))}
        </CatalogRow>
      )}

      {movie.tmdb_id && <p className="text-[11px] text-muted-foreground">Datos e imágenes: TMDB.</p>}
    </div>
  )
}
