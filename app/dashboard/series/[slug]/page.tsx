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
  const seasons = [...new Set(episodes.map((e) => e.season))]
  const requested = Number(temporada)
  const season = seasons.includes(requested) ? requested : (next?.episode.season ?? seasons[0])
  const shown = episodes.filter((e) => e.season === season)

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Catálogo
      </Link>

      <section className="flex flex-col gap-6 sm:flex-row">
        <div className="relative aspect-[2/3] w-40 shrink-0 overflow-hidden rounded-xl border border-border bg-card sm:w-52">
          <PosterImage src={series.poster_image_url ?? series.poster_url} thumbhash={series.poster_thumbhash} title={series.title} sizes="208px" />
        </div>
        <div className="max-w-3xl space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{series.title}</h1>
            {series.status === 'draft' && (
              <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
                Borrador · vista previa
              </span>
            )}
          </div>
          {series.original_title && <p className="text-sm text-muted-foreground">{series.original_title}</p>}
          <p className="text-xs font-mono uppercase tracking-wide text-muted-foreground">
            {[series.release_year, seriesCount(seasons.length, episodes.length), ...series.genres].filter(Boolean).join(' · ')}
          </p>
          {series.synopsis && <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-line">{series.synopsis}</p>}
          {next && (
            <Link
              href={`/dashboard/watch/${next.episode.slug}`}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Play className="h-4 w-4 fill-current" />
              {nextUpLabel(next)}
            </Link>
          )}
        </div>
      </section>

      <section aria-labelledby="episodes-heading" className="space-y-4">
        <h2 id="episodes-heading" className="text-xl font-bold tracking-tight">Episodios</h2>
        {seasons.length > 1 && (
          <nav aria-label="Temporadas" className="flex gap-2 overflow-x-auto pb-1">
            {seasons.map((s) => (
              <Link
                key={s}
                href={`/dashboard/series/${series.slug}?temporada=${s}`}
                aria-current={s === season ? 'page' : undefined}
                className={cn(
                  'shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors',
                  s === season ? 'border-accent bg-accent/15 text-foreground' : 'border-border bg-card/50 text-muted-foreground hover:text-foreground'
                )}
              >
                {seasonName(s)}
              </Link>
            ))}
          </nav>
        )}
        {shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">Esta serie todavía no tiene episodios.</p>
        ) : (
          <ol className="divide-y divide-border rounded-2xl border border-border bg-card/50">
            {shown.map((e) => {
              const position = progress.get(e.id)
              const ratio = position !== undefined && isInProgress(position, e.duration) ? progressRatio(position, e.duration) : null
              return (
                <li key={e.id}>
                  <Link
                    href={`/dashboard/watch/${e.slug}`}
                    className="flex items-center gap-4 px-4 py-3 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-2xl"
                    aria-label={`Ver ${episodeLabel(e.season, e.episode)} ${e.title}`}
                  >
                    <span className="w-10 shrink-0 text-center font-mono text-lg text-muted-foreground">{e.episode}</span>
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{e.title}</span>
                        {e.status === 'draft' && (
                          <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-mono uppercase text-muted-foreground">Borrador</span>
                        )}
                      </span>
                      {ratio !== null && (
                        <span className="block h-1 w-full max-w-xs rounded bg-border" role="progressbar" aria-label="Progreso" aria-valuenow={Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100}>
                          <span className="block h-full rounded bg-accent" style={{ width: `${ratio * 100}%` }} />
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs font-mono text-muted-foreground">{formatDuration(e.duration)}</span>
                  </Link>
                </li>
              )
            })}
          </ol>
        )}
      </section>
    </div>
  )
}
