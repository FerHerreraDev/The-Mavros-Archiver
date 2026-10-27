import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Play } from 'lucide-react'
import { getSeriesPage } from '@/lib/data/catalog'
import { formatDuration, formatTimestamp } from '@/lib/movies'
import { isInProgress, progressRatio } from '@/lib/progress'
import { episodeLabel, type NextUp } from '@/lib/series'
import type { CatalogEpisode } from '@/lib/data/catalog'
import { PosterImage } from '@/components/catalog/poster-image'
import { seriesCount } from '@/components/catalog/movie-card'
import { SeasonSelect } from '@/components/series/season-select'
import { playlistMembership } from '@/lib/data/playlists'
import { AddToList } from '@/components/lists/add-to-list'
import { cn } from '@/lib/utils'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const page = await getSeriesPage((await params).slug)
  return { title: page ? `${page.series.title} - The Mavros Archiver` : 'The Mavros Archiver' }
}

const seasonName = (season: number) => (season === 0 ? 'Especiales' : `Temporada ${season}`)

/** Texto del botón principal (SER-10) */
function nextUpLabel(next: NextUp<CatalogEpisode>) {
  const tag = episodeLabel(next.episode.season, next.episode.episode)
  switch (next.action) {
    case 'continue':
      return `Continuar ${tag} desde ${formatTimestamp(next.startAt)}`
    case 'rewatch':
      return `Volver a ver ${tag}`
    default:
      return `Reproducir ${tag}`
  }
}

export default async function SeriesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ temporada?: string }>
}) {
  const [{ slug }, { temporada }] = await Promise.all([params, searchParams])
  // RLS: publicada para cualquiera, borrador solo para admins; si no, 404 (SER-09)
  const page = await getSeriesPage(slug)
  if (!page) notFound()

  const { series, episodes, progress, next } = page
  const lists = await playlistMembership({ seriesId: series.id })
  const seasons = [...new Set(episodes.map((e) => e.season))]
  const requested = Number(temporada)
  const season = seasons.includes(requested) ? requested : (next?.episode.season ?? seasons[0])
  const shown = episodes.filter((e) => e.season === season)
  // Sin imagen horizontal, el póster de fondo (SER-17)
  const backdrop = series.backdrop_image_url ?? series.backdrop_url
  const background = backdrop
    ? { src: backdrop, thumbhash: series.backdrop_thumbhash }
    : { src: series.poster_image_url ?? series.poster_url, thumbhash: series.poster_thumbhash }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <section className="relative -mx-4 -mt-8 overflow-hidden sm:-mx-6 sm:rounded-b-2xl">
        <div className={cn('absolute inset-0', !backdrop && 'scale-110 blur-2xl opacity-60')} aria-hidden="true">
          <PosterImage src={background.src} thumbhash={background.thumbhash} title="" sizes="100vw" />
        </div>
        {/* Degradado para que el texto se lea sobre cualquier imagen */}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/75 to-background/10 sm:bg-gradient-to-r sm:from-background sm:via-background/80 sm:to-transparent" />
        <div className="relative flex min-h-[420px] flex-col justify-end gap-4 px-4 pb-8 pt-24 sm:min-h-[480px] sm:px-10 sm:pb-12 md:max-w-[65%]">
          <Link href="/dashboard" className="absolute left-4 top-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground sm:left-10">
            <ArrowLeft className="h-4 w-4" /> Catálogo
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">{series.title}</h1>
            {series.status === 'draft' && (
              <span className="rounded-full border border-border bg-background/60 px-2.5 py-0.5 text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
                Borrador · vista previa
              </span>
            )}
          </div>
          {series.original_title && <p className="text-sm text-muted-foreground">{series.original_title}</p>}
          <p className="text-xs font-mono uppercase tracking-wide text-foreground/80">
            {[series.release_year, seriesCount(seasons.length, episodes.length), ...series.genres].filter(Boolean).join(' · ')}
          </p>
          {series.synopsis && <p className="line-clamp-4 max-w-2xl text-sm leading-relaxed text-foreground/90 sm:text-base">{series.synopsis}</p>}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {next && (
              <Link
                href={`/dashboard/watch/${next.episode.slug}`}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                <Play className="h-4 w-4 fill-current" />
                {nextUpLabel(next)}
              </Link>
            )}
            <AddToList target={{ seriesId: series.id }} lists={lists} />
          </div>
        </div>
      </section>

      <section aria-labelledby="episodes-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="episodes-heading" className="text-xl font-bold tracking-tight">
            Episodios {seasons.length === 1 && season !== undefined && <span className="text-muted-foreground font-normal">· {seasonName(season)}</span>}
          </h2>
          {seasons.length > 1 && season !== undefined && <SeasonSelect slug={series.slug} seasons={seasons} current={season} />}
        </div>
        {shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">Esta serie todavía no tiene episodios.</p>
        ) : (
          <ol className="space-y-3">
            {shown.map((e) => (
              <EpisodeRow key={e.id} episode={e} position={progress.get(e.id)} isNext={next?.episode.id === e.id} />
            ))}
          </ol>
        )}
      </section>

      {series.tmdb_id && <p className="text-[11px] text-muted-foreground">Datos e imágenes: TMDB.</p>}
    </div>
  )
}

/** Episodio con imagen 16:9, progreso, título, duración y sinopsis (SER-18) */
function EpisodeRow({ episode: e, position, isNext }: { episode: CatalogEpisode; position: number | undefined; isNext: boolean }) {
  const ratio = position !== undefined && isInProgress(position, e.duration) ? progressRatio(position, e.duration) : null
  return (
    <li>
      <Link
        href={`/dashboard/watch/${e.slug}`}
        aria-label={`Ver ${episodeLabel(e.season, e.episode)} ${e.title}`}
        aria-current={isNext ? 'true' : undefined}
        className={cn(
          'group flex gap-4 rounded-2xl border p-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          isNext ? 'border-accent/60 bg-accent/5' : 'border-border bg-card/40 hover:bg-card'
        )}
      >
        <span className="hidden w-8 shrink-0 self-center text-center font-mono text-xl text-muted-foreground sm:block">{e.episode}</span>
        <div className="relative aspect-video w-36 shrink-0 overflow-hidden rounded-lg border border-border bg-card sm:w-56">
          <PosterImage src={e.poster_image_url ?? e.poster_url} thumbhash={e.poster_thumbhash} title={e.title} sizes="(min-width: 640px) 224px, 144px" />
          <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/40 group-hover:opacity-100">
            <Play className="h-8 w-8 fill-white text-white" />
          </span>
          {ratio !== null && (
            <span className="absolute inset-x-0 bottom-0 block h-1 bg-black/60" role="progressbar" aria-label="Progreso" aria-valuenow={Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100}>
              <span className="block h-full bg-accent" style={{ width: `${ratio * 100}%` }} />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1 py-1">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-semibold leading-snug sm:text-base">
              <span className="sm:hidden">{e.episode}. </span>
              {e.title}
            </p>
            <span className="shrink-0 text-xs font-mono text-muted-foreground">{formatDuration(e.duration)}</span>
          </div>
          {e.status === 'draft' && (
            <span className="inline-block rounded-full border border-border px-2 py-0.5 text-[10px] font-mono uppercase text-muted-foreground">Borrador</span>
          )}
          {e.synopsis && <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground sm:text-sm">{e.synopsis}</p>}
        </div>
      </Link>
    </li>
  )
}
