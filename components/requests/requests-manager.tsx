'use client'

import { useState, useTransition } from 'react'
import { Inbox, Send, Trash2 } from 'lucide-react'
import { deleteRequestAction, requestMovieAction, type RequestActionResult } from '@/lib/actions/request.actions'
import { REQUEST_STATUS_LABEL, type MovieRequest } from '@/lib/requests'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { LocalTime } from '@/components/ui/local-time'
import { ACTION_BUTTON } from '@/components/admin/row-actions'
import { cn } from '@/lib/utils'

const STATUS_STYLE: Record<MovieRequest['status'], string> = {
  pending: 'border-border text-muted-foreground',
  added: 'border-emerald-500/40 text-emerald-400',
  rejected: 'border-destructive/40 text-destructive',
}

export function RequestStatusBadge({ status }: { status: MovieRequest['status'] }) {
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-mono uppercase tracking-wide', STATUS_STYLE[status])}>
      {REQUEST_STATUS_LABEL[status]}
    </span>
  )
}

/** Mis pedidos: pedir algo nuevo y ver cómo van (REQ-04) */
export function RequestsManager({ requests }: { requests: MovieRequest[] }) {
  const [isPending, startTransition] = useTransition()
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [feedback, setFeedback] = useState<RequestActionResult | null>(null)

  const submit = () =>
    startTransition(async () => {
      setFeedback(null)
      try {
        const result = await requestMovieAction({ title, note })
        setFeedback(result)
        if (!result.error) {
          setTitle('')
          setNote('')
        }
      } catch {
        setFeedback({ error: 'Error de red. Revisa tu conexión.' })
      }
    })

  return (
    <div className="space-y-6">
      <form
        className="max-w-md space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Película o serie" aria-label="Qué quieres ver" maxLength={200} disabled={isPending} />
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota (opcional): año, idioma…" aria-label="Nota" maxLength={500} disabled={isPending} />
        <button
          type="submit"
          disabled={isPending || !title.trim()}
          aria-busy={isPending || undefined}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {isPending ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
          Pedir
        </button>
        {feedback?.error && <p className="text-sm text-destructive" role="alert">{feedback.error}</p>}
        {feedback?.success && <p className="text-sm text-foreground" role="status">{feedback.success}</p>}
      </form>

      {requests.length === 0 ? (
        <div className="bg-card/50 border border-border rounded-2xl p-10 text-center space-y-2">
          <Inbox className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Todavía no has pedido nada.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card/50" aria-label="Mis pedidos">
          {requests.map((r) => (
            <RequestRow key={r.id} request={r} />
          ))}
        </ul>
      )}
    </div>
  )
}

function RequestRow({ request }: { request: MovieRequest }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <span className="block truncate font-medium">{request.title}</span>
        {request.note && <span className="block truncate text-sm text-muted-foreground">{request.note}</span>}
        <span className="text-xs font-mono text-muted-foreground">
          <LocalTime iso={request.created_at} />
        </span>
      </div>
      <RequestStatusBadge status={request.status} />
      {request.status === 'pending' && (
        <button
          type="button"
          className={ACTION_BUTTON}
          disabled={isPending}
          aria-busy={isPending || undefined}
          aria-label={`Borrar pedido ${request.title}`}
          onClick={() =>
            startTransition(async () => {
              setError(null)
              try {
                const result = await deleteRequestAction(request.id)
                if (result.error) setError(result.error)
              } catch {
                setError('Error de red. Revisa tu conexión.')
              }
            })
          }
        >
          {isPending ? <Spinner /> : <Trash2 className="h-3.5 w-3.5" />}
          Borrar
        </button>
      )}
      {error && <p className="w-full text-sm text-destructive" role="alert">{error}</p>}
    </li>
  )
}
