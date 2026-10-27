'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Plus, Pencil, Tv, Eye, Sparkles } from 'lucide-react'
import { fillEpisodesFromTmdbAction } from '@/lib/actions/tmdb.actions'
import { deleteSeriesAction, publishSeriesDraftsAction, setSeriesStatusAction } from '@/lib/actions/series.actions'
import type { MovieActionResult } from '@/lib/actions/movie.actions'
import { formatDuration } from '@/lib/movies'
import { episodeLabel } from '@/lib/series'
import type { AdminEpisode, AdminSeries } from '@/lib/data/series'
import { Spinner } from '@/components/ui/spinner'
import { LinkPendingIcon } from '@/components/ui/link-pending'
import { ACTION_BUTTON, RowActions, Thumb } from './row-actions'

const episodesText = (n: number) => (n === 1 ? '1 episodio' : `${n} episodios`)

/** Lista de series del panel (SER-05) */
export function SeriesTable({ series }: { series: AdminSeries[] }) {
  if (series.length === 0) {
    return (
      <div className="bg-card/50 backdrop-blur-xl border border-border rounded-2xl p-10 text-center space-y-2">
        <Tv className="h-8 w-8 mx-auto text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Todavía no hay series.</p>
      </div>
    )
  }

  return (
    <section className="bg-card/50 backdrop-blur-xl border border-border rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
              <th scope="col" className="px-6 py-3 font-normal">Serie</th>
              <th scope="col" className="px-3 py-3 font-normal">Año</th>
              <th scope="col" className="px-3 py-3 font-normal">Episodios</th>
              <th scope="col" className="px-3 py-3 font-normal">Estado</th>
              <th scope="col" className="px-6 py-3 font-normal text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {series.map((s) => {
              const published = s.status === 'published'
              return (
                <RowActions
                  key={s.id}
                  title={s.title}
                  editHref={`/dashboard/admin/series/${s.id}/edit`}
                  published={published}
                  onToggleStatus={() => setSeriesStatusAction({ id: s.id, status: published ? 'draft' : 'published' })}
                  onDelete={() => deleteSeriesAction({ id: s.id })}
                  deleteDetail={s.episode_count > 0 ? `con ${episodesText(s.episode_count)}` : undefined}
                  cells={(feedback) => (
                    <>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-3">
                          <Thumb src={s.poster_image_url ?? s.poster_url} />
                          <div>
                            <div className="text-foreground font-medium">{s.title}</div>
                            <div className="text-[11px] font-mono text-muted-foreground">{s.slug}</div>
                            {feedback}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{s.release_year ?? '—'}</td>
                      <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">{episodesText(s.episode_count)}</td>
                    </>
                  )}
                />
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/** Episodios de la serie en orden + "Publicar borradores (N)" (SER-07) */
export function SeriesEpisodes({ seriesId, episodes, tmdbLinked = false }: { seriesId: string; episodes: AdminEpisode[]; tmdbLinked?: boolean }) {
  const [isPending, startTransition] = useTransition()
  const [running, setRunning] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<MovieActionResult | null>(null)
  const drafts = episodes.filter((e) => e.status === 'draft').length

  const run = (key: string, action: () => Promise<MovieActionResult>) => {
    setRunning(key)
    startTransition(async () => {
      setFeedback(null)
      try {
        setFeedback(await action())
      } catch {
        setFeedback({ error: 'Error de red. Revisa tu conexión.' })
      }
    })
  }
  const busy = (key: string) => (isPending && running === key) || undefined

  return (
    <section aria-labelledby="episodes-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="episodes-heading" className="text-lg font-semibold tracking-tight">
          Episodios ({episodes.length})
        </h3>
        <div className="flex flex-wrap gap-2">
          {drafts > 0 && (
            <button type="button" className={ACTION_BUTTON} disabled={isPending} aria-busy={busy('publish')} onClick={() => run('publish', () => publishSeriesDraftsAction({ id: seriesId }))}>
              {busy('publish') ? <Spinner /> : <Eye className="h-3.5 w-3.5" />}
              Publicar borradores ({drafts})
            </button>
          )}
          {tmdbLinked && episodes.length > 0 && (
            <button type="button" className={ACTION_BUTTON} disabled={isPending} aria-busy={busy('tmdb')} onClick={() => run('tmdb', () => fillEpisodesFromTmdbAction({ seriesId }))}>
              {busy('tmdb') ? <Spinner /> : <Sparkles className="h-3.5 w-3.5" />}
              Completar episodios desde TMDB
            </button>
          )}
          <Link href={`/dashboard/admin/movies/new?serie=${seriesId}`} className={ACTION_BUTTON}>
            <LinkPendingIcon>
              <Plus className="h-3.5 w-3.5" />
            </LinkPendingIcon>
            Agregar episodio
          </Link>
        </div>
      </div>
      {feedback?.error && <p className="text-sm text-destructive" role="alert">{feedback.error}</p>}
      {feedback?.success && <p className="text-sm text-emerald-400" role="status">{feedback.success}</p>}

      {episodes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Sin episodios. Suelta los archivos en la carpeta de la Mac (S01E01…) o agrégalos a mano.
        </p>
      ) : (
        <ol className="divide-y divide-border rounded-2xl border border-border bg-card/50">
          {episodes.map((e) => (
            <li key={e.id} className="flex items-center gap-4 px-4 py-3 text-sm">
              <span className="w-16 shrink-0 font-mono text-muted-foreground">{episodeLabel(e.season, e.episode)}</span>
              <span className="min-w-0 flex-1 truncate">{e.title}</span>
              <span className="shrink-0 text-xs font-mono text-muted-foreground">{formatDuration(e.duration)}</span>
              <span className="shrink-0 text-[11px] font-mono uppercase text-muted-foreground">
                {e.status === 'published' ? 'Publicado' : 'Borrador'}
              </span>
              <Link href={`/dashboard/admin/movies/${e.id}/edit`} className={ACTION_BUTTON} aria-label={`Editar ${episodeLabel(e.season, e.episode)}`}>
                <LinkPendingIcon>
                  <Pencil className="h-3.5 w-3.5" />
                </LinkPendingIcon>
                Editar
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
