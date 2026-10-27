'use client'

import { useState, useTransition } from 'react'
import { Check, ListPlus, Plus } from 'lucide-react'
import { createPlaylistAction, togglePlaylistItemAction, type PlaylistActionResult } from '@/lib/actions/playlist.actions'
import type { PlaylistTarget } from '@/lib/data/playlists'
import { Spinner } from '@/components/ui/spinner'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type Props = { target: PlaylistTarget; lists: { id: string; name: string; contains: boolean }[] }

/** "Agregar a lista": mis listas marcadas, tocar agrega o quita, y crear una nueva ahí mismo (PL-04) */
export function AddToList({ target, lists }: Props) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [running, setRunning] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<PlaylistActionResult | null>(null)
  const [name, setName] = useState('')
  const inAny = lists.some((l) => l.contains)

  const run = (key: string, action: () => Promise<PlaylistActionResult>, after?: () => void) => {
    setRunning(key)
    startTransition(async () => {
      setFeedback(null)
      try {
        const result = await action()
        setFeedback(result)
        if (!result.error) after?.()
      } catch {
        setFeedback({ error: 'Error de red. Revisa tu conexión.' })
      }
    })
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-medium text-foreground hover:bg-card transition-colors"
      >
        {inAny ? <Check className="h-4 w-4 text-accent" /> : <ListPlus className="h-4 w-4" />}
        Agregar a lista
      </button>

      {open && (
        <div role="dialog" aria-label="Agregar a lista" className="absolute left-0 z-20 mt-2 w-72 space-y-3 rounded-2xl border border-border bg-card p-3 shadow-xl">
          {lists.length > 0 ? (
            <ul className="space-y-1">
              {lists.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={l.contains}
                    disabled={isPending}
                    aria-busy={(isPending && running === l.id) || undefined}
                    onClick={() => run(l.id, () => togglePlaylistItemAction({ playlistId: l.id, target }))}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-background disabled:opacity-60"
                  >
                    <span className={cn('flex h-4 w-4 items-center justify-center rounded border', l.contains ? 'border-accent bg-accent' : 'border-field')}>
                      {isPending && running === l.id ? <Spinner className="h-3 w-3" /> : l.contains && <Check className="h-3 w-3 text-white" />}
                    </span>
                    <span className="truncate">{l.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-1 text-sm text-muted-foreground">Todavía no tienes listas.</p>
          )}

          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              run('new', () => createPlaylistAction({ name, add: target }), () => setName(''))
            }}
          >
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nueva lista"
              aria-label="Nombre de la lista nueva"
              maxLength={100}
              disabled={isPending}
              className="h-9"
            />
            <button
              type="submit"
              disabled={isPending || !name.trim()}
              aria-label="Crear lista y agregar"
              aria-busy={(isPending && running === 'new') || undefined}
              className="inline-flex shrink-0 items-center justify-center rounded-lg bg-primary px-3 text-primary-foreground disabled:opacity-50"
            >
              {isPending && running === 'new' ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            </button>
          </form>
          {feedback?.error && <p className="text-xs text-destructive" role="alert">{feedback.error}</p>}
          {feedback?.success && <p className="text-xs text-emerald-400" role="status">{feedback.success}</p>}
        </div>
      )}
    </div>
  )
}
