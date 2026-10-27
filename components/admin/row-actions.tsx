'use client'

import { useState, useTransition, type ReactNode } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Pencil, Eye, EyeOff, Trash2, Film } from 'lucide-react'
import type { MovieActionResult } from '@/lib/actions/movie.actions'
import { cn } from '@/lib/utils'
import { Spinner } from '@/components/ui/spinner'
import { LinkPendingIcon } from '@/components/ui/link-pending'

export const ACTION_BUTTON =
  'inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-card hover:text-foreground text-muted-foreground transition-colors disabled:opacity-50 disabled:pointer-events-none'
const BADGE = 'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-mono uppercase tracking-wide'

export function Thumb({ src }: { src: string | null }) {
  return (
    <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-md border border-border bg-card">
      {src ? (
        <Image src={src} alt="" fill sizes="40px" unoptimized className="object-cover" />
      ) : (
        <Film className="absolute inset-0 m-auto h-4 w-4 text-muted-foreground" />
      )}
    </div>
  )
}

type Props = {
  title: string
  editHref: string
  published: boolean
  onToggleStatus: () => Promise<MovieActionResult>
  onDelete: () => Promise<MovieActionResult>
  /** Texto extra del botón de confirmar borrado (ej. "y sus 8 episodios") */
  deleteDetail?: string
  /** Celdas de datos de la fila; recibe el mensaje de resultado para mostrarlo junto al título */
  cells: (feedback: ReactNode) => ReactNode
}

/** Fila de tabla del panel con Estado + Editar / Publicar / Borrar (MOV-11, SER-05, UX-01) */
export function RowActions({ title, editHref, published, onToggleStatus, onDelete, deleteDetail, cells }: Props) {
  const [isPending, startTransition] = useTransition()
  // Qué botón se tocó: solo ese muestra el indicador; todos quedan bloqueados (UX-01)
  const [running, setRunning] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<MovieActionResult | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const run = (key: string, action: () => Promise<MovieActionResult>) => {
    setRunning(key)
    startTransition(async () => {
      setFeedback(null)
      try {
        setFeedback(await action())
      } catch (err) {
        console.error('Admin action error:', err)
        setFeedback({ error: 'Error de red. Revisa tu conexión.' })
      }
    })
  }

  const busy = (key: string) => (isPending && running === key) || undefined
  const message = (
    <>
      {feedback?.error && <p className="text-xs text-destructive mt-1" role="alert">{feedback.error}</p>}
      {feedback?.success && <p className="text-xs text-emerald-400 mt-1" role="status">{feedback.success}</p>}
    </>
  )

  return (
    <tr className="align-middle">
      {cells(message)}
      <td className="px-3 py-3">
        <span
          className={cn(
            BADGE,
            published ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10' : 'border-border text-muted-foreground'
          )}
        >
          {published ? 'Publicada' : 'Borrador'}
        </span>
      </td>
      <td className="px-6 py-3">
        <div className="flex flex-wrap justify-end gap-2">
          <Link href={editHref} className={ACTION_BUTTON} aria-label={`Editar ${title}`}>
            <LinkPendingIcon>
              <Pencil className="h-3.5 w-3.5" />
            </LinkPendingIcon>
            Editar
          </Link>
          <button
            type="button"
            className={ACTION_BUTTON}
            disabled={isPending}
            aria-label={published ? `Despublicar ${title}` : `Publicar ${title}`}
            aria-busy={busy('status')}
            onClick={() => run('status', onToggleStatus)}
          >
            {busy('status') ? <Spinner /> : published ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {published ? 'Despublicar' : 'Publicar'}
          </button>
          {confirmingDelete ? (
            <>
              <button
                type="button"
                className={`${ACTION_BUTTON} border-destructive/50 text-destructive`}
                disabled={isPending}
                aria-label={`Confirmar borrar ${title}`}
                aria-busy={busy('delete')}
                onClick={() => run('delete', onDelete)}
              >
                {busy('delete') ? <Spinner /> : <Trash2 className="h-3.5 w-3.5" />}
                ¿Seguro? Borrar{deleteDetail ? ` ${deleteDetail}` : ''}
              </button>
              <button type="button" className={ACTION_BUTTON} disabled={isPending} onClick={() => setConfirmingDelete(false)}>
                Cancelar
              </button>
            </>
          ) : (
            <button
              type="button"
              className={`${ACTION_BUTTON} hover:border-destructive/50 hover:text-destructive`}
              disabled={isPending}
              aria-label={`Borrar ${title}`}
              onClick={() => setConfirmingDelete(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Borrar
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}
