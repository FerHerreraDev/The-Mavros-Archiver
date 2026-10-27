'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { ListVideo, Pencil, Plus, Trash2 } from 'lucide-react'
import { createPlaylistAction, deletePlaylistAction, renamePlaylistAction, type PlaylistActionResult } from '@/lib/actions/playlist.actions'
import type { PlaylistSummary } from '@/lib/data/playlists'
import { Spinner } from '@/components/ui/spinner'
import { Input } from '@/components/ui/input'
import { ACTION_BUTTON } from '@/components/admin/row-actions'

const itemsText = (n: number) => (n === 1 ? '1 elemento' : `${n} elementos`)

/** Mis listas: crear, renombrar y borrar (PL-03) */
export function ListsManager({ lists }: { lists: PlaylistSummary[] }) {
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState('')
  const [feedback, setFeedback] = useState<PlaylistActionResult | null>(null)

  const create = () =>
    startTransition(async () => {
      setFeedback(null)
      try {
        const result = await createPlaylistAction({ name })
        setFeedback(result)
        if (!result.error) setName('')
      } catch {
        setFeedback({ error: 'Error de red. Revisa tu conexión.' })
      }
    })

  return (
    <div className="space-y-6">
      <form
        className="flex max-w-md gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          create()
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre de la lista" aria-label="Nombre de la lista" maxLength={100} disabled={isPending} />
        <button
          type="submit"
          disabled={isPending || !name.trim()}
          aria-busy={isPending || undefined}
          className="inline-flex shrink-0 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {isPending ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          Crear lista
        </button>
      </form>
      {feedback?.error && <p className="text-sm text-destructive" role="alert">{feedback.error}</p>}

      {lists.length === 0 ? (
        <div className="bg-card/50 border border-border rounded-2xl p-10 text-center space-y-2">
          <ListVideo className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Todavía no tienes listas. Crea una aquí o usa <strong>Agregar a lista</strong> en cualquier película o serie.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card/50">
          {lists.map((l) => (
            <ListRow key={l.id} list={l} />
          ))}
        </ul>
      )}
    </div>
  )
}

function ListRow({ list }: { list: PlaylistSummary }) {
  const [isPending, startTransition] = useTransition()
  const [running, setRunning] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [name, setName] = useState(list.name)
  const [error, setError] = useState<string | null>(null)

  const run = (key: string, action: () => Promise<PlaylistActionResult>, after?: () => void) => {
    setRunning(key)
    startTransition(async () => {
      setError(null)
      try {
        const result = await action()
        if (result.error) setError(result.error)
        else after?.()
      } catch {
        setError('Error de red. Revisa tu conexión.')
      }
    })
  }
  const busy = (key: string) => (isPending && running === key) || undefined

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      {editing ? (
        <form
          className="flex flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            run('rename', () => renamePlaylistAction({ id: list.id, name }), () => setEditing(false))
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} aria-label={`Nuevo nombre de ${list.name}`} maxLength={100} disabled={isPending} autoFocus />
          <button type="submit" className={ACTION_BUTTON} disabled={isPending} aria-busy={busy('rename')}>
            {busy('rename') && <Spinner />}
            Guardar
          </button>
          <button type="button" className={ACTION_BUTTON} disabled={isPending} onClick={() => setEditing(false)}>
            Cancelar
          </button>
        </form>
      ) : (
        <Link href={`/dashboard/lists/${list.id}`} className="min-w-0 flex-1 hover:underline">
          <span className="block truncate font-medium">{list.name}</span>
          <span className="text-xs font-mono text-muted-foreground">{itemsText(list.count)}</span>
        </Link>
      )}
      {!editing && (
        <div className="flex gap-2">
          <button type="button" className={ACTION_BUTTON} disabled={isPending} onClick={() => setEditing(true)} aria-label={`Renombrar ${list.name}`}>
            <Pencil className="h-3.5 w-3.5" />
            Renombrar
          </button>
          {confirming ? (
            <>
              <button
                type="button"
                className={`${ACTION_BUTTON} border-destructive/50 text-destructive`}
                disabled={isPending}
                aria-busy={busy('delete')}
                aria-label={`Confirmar borrar ${list.name}`}
                onClick={() => run('delete', () => deletePlaylistAction({ id: list.id }))}
              >
                {busy('delete') ? <Spinner /> : <Trash2 className="h-3.5 w-3.5" />}
                ¿Seguro? Borrar
              </button>
              <button type="button" className={ACTION_BUTTON} disabled={isPending} onClick={() => setConfirming(false)}>
                Cancelar
              </button>
            </>
          ) : (
            <button type="button" className={ACTION_BUTTON} disabled={isPending} onClick={() => setConfirming(true)} aria-label={`Borrar ${list.name}`}>
              <Trash2 className="h-3.5 w-3.5" />
              Borrar
            </button>
          )}
        </div>
      )}
      {error && <p className="w-full text-xs text-destructive" role="alert">{error}</p>}
    </li>
  )
}
