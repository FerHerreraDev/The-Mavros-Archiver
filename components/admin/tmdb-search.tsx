'use client'

import { useState, useTransition } from 'react'
import { Search, Check, Film } from 'lucide-react'
import { applyTmdbAction, searchTmdbAction, type TmdbApplyResult } from '@/lib/actions/tmdb.actions'
import type { TmdbResult } from '@/lib/tmdb/client.mjs'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { ACTION_BUTTON } from './row-actions'

type Props = { kind: 'movie' | 'series'; id: string; title: string; year: number | null; linked: boolean }

/** "Buscar en TMDB": elegir un resultado llena los campos vacíos (TMDB-02) */
export function TmdbSearch({ kind, id, title, year, linked }: Props) {
  const [query, setQuery] = useState(title)
  const [results, setResults] = useState<TmdbResult[] | null>(null)
  const [feedback, setFeedback] = useState<TmdbApplyResult | null>(null)
  const [running, setRunning] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const run = (key: string, action: () => Promise<void>) => {
    setRunning(key)
    startTransition(async () => {
      setFeedback(null)
      try {
        await action()
      } catch {
        setFeedback({ error: 'Error de red. Revisa tu conexión.' })
      }
    })
  }

  return (
    <section aria-labelledby="tmdb-heading" className="space-y-3 rounded-2xl border border-border bg-card/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 id="tmdb-heading" className="text-sm font-semibold">
          Datos de TMDB {linked && <span className="ml-2 text-xs font-normal text-emerald-400">· vinculada</span>}
        </h4>
        <p className="text-xs text-muted-foreground">Solo llena los campos vacíos; el título no cambia.</p>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          run('search', async () => {
            const res = await searchTmdbAction({ kind, query, year })
            setResults(res.results ?? null)
            if (res.error) setFeedback({ error: res.error })
          })
        }}
      >
        <Input value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar en TMDB" maxLength={200} disabled={isPending} />
        <button type="submit" className={ACTION_BUTTON} disabled={isPending || !query.trim()} aria-busy={(isPending && running === 'search') || undefined}>
          {isPending && running === 'search' ? <Spinner /> : <Search className="h-3.5 w-3.5" />}
          Buscar en TMDB
        </button>
      </form>

      {results && results.length === 0 && <p className="text-sm text-muted-foreground">Sin resultados. Prueba con el título original.</p>}
      {results && results.length > 0 && (
        <ul className="divide-y divide-border rounded-xl border border-border" aria-label="Resultados de TMDB">
          {results.map((r) => (
            <li key={r.tmdbId} className="flex items-center gap-3 px-3 py-2">
              <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-md border border-border bg-card">
                {r.posterUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.posterUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <Film className="absolute inset-0 m-auto h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {r.title} {r.year && <span className="text-muted-foreground">({r.year})</span>}
                </p>
                {r.overview && <p className="line-clamp-1 text-xs text-muted-foreground">{r.overview}</p>}
              </div>
              <button
                type="button"
                className={ACTION_BUTTON}
                disabled={isPending}
                aria-label={`Usar ${r.title}${r.year ? ` (${r.year})` : ''}`}
                aria-busy={(isPending && running === `apply-${r.tmdbId}`) || undefined}
                onClick={() =>
                  run(`apply-${r.tmdbId}`, async () => {
                    const res = await applyTmdbAction({ kind, id, tmdbId: r.tmdbId })
                    setFeedback(res)
                    if (res.success) setResults(null)
                  })
                }
              >
                {isPending && running === `apply-${r.tmdbId}` ? <Spinner /> : <Check className="h-3.5 w-3.5" />}
                Usar este
              </button>
            </li>
          ))}
        </ul>
      )}
      {feedback?.error && <p className="text-sm text-destructive" role="alert">{feedback.error}</p>}
      {feedback?.success && <p className="text-sm text-emerald-400" role="status">{feedback.success}</p>}
      <p className="text-[11px] text-muted-foreground">Datos e imágenes: TMDB. Este producto usa la API de TMDB pero no está avalado ni certificado por TMDB.</p>
    </section>
  )
}
