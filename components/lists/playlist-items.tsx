'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowUp, X } from 'lucide-react'
import { movePlaylistItemAction, removePlaylistItemAction, type PlaylistActionResult } from '@/lib/actions/playlist.actions'
import type { PlaylistItem } from '@/lib/data/playlists'
import { formatDuration } from '@/lib/movies'
import { episodeLabel } from '@/lib/series'
import { Spinner } from '@/components/ui/spinner'
import { Thumb } from '@/components/admin/row-actions'

const ICON_BUTTON =
  'inline-flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground hover:text-foreground hover:bg-card disabled:opacity-40 disabled:pointer-events-none'

/** Elementos de la lista en orden: quitar y mover arriba/abajo (PL-05) */
export function PlaylistItems({ playlistId, items }: { playlistId: string; items: PlaylistItem[] }) {
  const [isPending, startTransition] = useTransition()
  const [running, setRunning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = (key: string, action: () => Promise<PlaylistActionResult>) => {
    setRunning(key)
    startTransition(async () => {
      setError(null)
      try {
        const result = await action()
        if (result.error) setError(result.error)
      } catch {
        setError('Error de red. Revisa tu conexión.')
      }
    })
  }
  const spin = (key: string) => isPending && running === key

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <ol className="divide-y divide-border rounded-2xl border border-border bg-card/50">
        {items.map((item, i) => {
          const movie = item.movie
          const title = movie?.title ?? item.series!.title
          const href = movie ? `/dashboard/watch/${movie.slug}` : `/dashboard/series/${item.series!.slug}`
          const meta = movie
            ? [movie.season_number !== null && movie.episode_number !== null ? episodeLabel(movie.season_number, movie.episode_number) : movie.release_year, formatDuration(movie.duration_seconds)]
            : ['Serie', item.series!.release_year]
          return (
            <li key={item.id} className="flex items-center gap-3 px-4 py-3" aria-label={title}>
              <span className="w-6 shrink-0 text-center font-mono text-sm text-muted-foreground">{i + 1}</span>
              <Thumb src={(movie ?? item.series)!.poster_image_url ?? (movie ?? item.series)!.poster_url} />
              <Link href={href} className="min-w-0 flex-1 hover:underline">
                <span className="block truncate font-medium">{title}</span>
                <span className="text-xs font-mono uppercase text-muted-foreground">{meta.filter(Boolean).join(' · ')}</span>
              </Link>
              <div className="flex gap-1">
                <button type="button" className={ICON_BUTTON} disabled={isPending || i === 0} aria-label={`Subir ${title}`} onClick={() => run(`up-${item.id}`, () => movePlaylistItemAction({ playlistId, itemId: item.id, direction: 'up' }))}>
                  {spin(`up-${item.id}`) ? <Spinner /> : <ArrowUp className="h-4 w-4" />}
                </button>
                <button type="button" className={ICON_BUTTON} disabled={isPending || i === items.length - 1} aria-label={`Bajar ${title}`} onClick={() => run(`down-${item.id}`, () => movePlaylistItemAction({ playlistId, itemId: item.id, direction: 'down' }))}>
                  {spin(`down-${item.id}`) ? <Spinner /> : <ArrowDown className="h-4 w-4" />}
                </button>
                <button type="button" className={ICON_BUTTON} disabled={isPending} aria-label={`Quitar ${title}`} onClick={() => run(`rm-${item.id}`, () => removePlaylistItemAction({ playlistId, itemId: item.id }))}>
                  {spin(`rm-${item.id}`) ? <Spinner /> : <X className="h-4 w-4" />}
                </button>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
