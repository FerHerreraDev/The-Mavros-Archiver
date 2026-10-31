'use client'

import { useState, useTransition } from 'react'
import { Check, Inbox, Undo2, X } from 'lucide-react'
import { resolveRequestAction } from '@/lib/actions/request.actions'
import type { AdminRequest } from '@/lib/data/requests'
import { Spinner } from '@/components/ui/spinner'
import { LocalTime } from '@/components/ui/local-time'
import { ACTION_BUTTON } from '@/components/admin/row-actions'
import { RequestStatusBadge } from '@/components/requests/requests-manager'

/** Pedidos de todos con "Ya está" / "No se puede" (REQ-05) */
export function RequestsTable({ requests }: { requests: AdminRequest[] }) {
  if (requests.length === 0) {
    return (
      <div className="bg-card/50 border border-border rounded-2xl p-10 text-center space-y-2">
        <Inbox className="h-8 w-8 mx-auto text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Nadie ha pedido nada todavía.</p>
      </div>
    )
  }
  return (
    <ul className="divide-y divide-border rounded-2xl border border-border bg-card/50" aria-label="Pedidos">
      {requests.map((r) => (
        <Row key={r.id} request={r} />
      ))}
    </ul>
  )
}

function Row({ request }: { request: AdminRequest }) {
  const [isPending, startTransition] = useTransition()
  const [running, setRunning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const set = (status: AdminRequest['status']) => {
    setRunning(status)
    startTransition(async () => {
      setError(null)
      try {
        const result = await resolveRequestAction({ id: request.id, status })
        if (result.error) setError(result.error)
      } catch {
        setError('Error de red. Revisa tu conexión.')
      }
    })
  }
  const busy = (status: string) => (isPending && running === status) || undefined

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3" data-testid="request-row">
      <div className="min-w-0 flex-1">
        <span className="block font-medium">{request.title}</span>
        {request.note && <span className="block text-sm text-muted-foreground">{request.note}</span>}
        <span className="text-xs font-mono text-muted-foreground">
          {request.email ?? 'usuario borrado'} · <LocalTime iso={request.created_at} />
        </span>
      </div>
      <RequestStatusBadge status={request.status} />
      {request.status === 'pending' ? (
        <>
          <button type="button" className={ACTION_BUTTON} disabled={isPending} aria-busy={busy('added')} onClick={() => set('added')}>
            {busy('added') ? <Spinner /> : <Check className="h-3.5 w-3.5" />}
            Ya está
          </button>
          <button type="button" className={ACTION_BUTTON} disabled={isPending} aria-busy={busy('rejected')} onClick={() => set('rejected')}>
            {busy('rejected') ? <Spinner /> : <X className="h-3.5 w-3.5" />}
            No se puede
          </button>
        </>
      ) : (
        <button type="button" className={ACTION_BUTTON} disabled={isPending} aria-busy={busy('pending')} onClick={() => set('pending')}>
          {busy('pending') ? <Spinner /> : <Undo2 className="h-3.5 w-3.5" />}
          Reabrir
        </button>
      )}
      {error && <p className="w-full text-sm text-destructive" role="alert">{error}</p>}
    </li>
  )
}
