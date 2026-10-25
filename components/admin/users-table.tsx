'use client'

import { useState, useTransition } from 'react'
import { ShieldCheck, ShieldOff, MailPlus, Ban, RotateCcw } from 'lucide-react'
import {
  updateUserRoleAction,
  resendInviteAction,
  setUserActiveAction,
  type AdminActionResult,
} from '@/lib/actions/admin.actions'
import type { AdminUserRow } from '@/lib/data/admin-users'
import { StatusBadge, RoleBadge } from '@/components/ui/status-badge'
import { LocalTime } from '@/components/ui/local-time'

const ACTION_BUTTON =
  'inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-card hover:text-foreground text-muted-foreground transition-colors disabled:opacity-50 disabled:pointer-events-none'

export function UsersTable({ users }: { users: AdminUserRow[] }) {
  return (
    <section className="bg-card/50 backdrop-blur-xl border border-border rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-baseline justify-between">
        <div>
          <span className="text-xs font-mono text-muted-foreground uppercase tracking-wide">Users</span>
          <h3 className="text-lg font-semibold tracking-tight">Usuarios con acceso</h3>
        </div>
        <span className="text-xs font-mono text-muted-foreground">{users.length} total</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
              <th scope="col" className="px-6 py-3 font-normal">Email</th>
              <th scope="col" className="px-3 py-3 font-normal">Rol</th>
              <th scope="col" className="px-3 py-3 font-normal">Estado</th>
              <th scope="col" className="px-3 py-3 font-normal">Alta</th>
              <th scope="col" className="px-3 py-3 font-normal">Último acceso</th>
              <th scope="col" className="px-6 py-3 font-normal text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((user) => (
              <UserRow key={user.id} user={user} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function UserRow({ user }: { user: AdminUserRow }) {
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<AdminActionResult | null>(null)

  const run = (action: () => Promise<AdminActionResult>) => {
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

  const nextRole = user.role === 'admin' ? 'user' : 'admin'

  return (
    <tr className="align-middle">
      <td className="px-6 py-3">
        <div className="text-foreground">{user.email}</div>
        {user.isSelf && <div className="text-[11px] font-mono text-muted-foreground">tú</div>}
        {feedback?.error && (
          <p className="text-xs text-destructive mt-1" role="alert">{feedback.error}</p>
        )}
        {feedback?.success && (
          <p className="text-xs text-emerald-400 mt-1" role="status">{feedback.success}</p>
        )}
      </td>
      <td className="px-3 py-3"><RoleBadge role={user.role} /></td>
      <td className="px-3 py-3"><StatusBadge status={user.status} /></td>
      <td className="px-3 py-3 text-muted-foreground whitespace-nowrap"><LocalTime iso={user.createdAt} /></td>
      <td className="px-3 py-3 text-muted-foreground whitespace-nowrap"><LocalTime iso={user.lastSignInAt} fallback="Nunca" /></td>
      <td className="px-6 py-3">
        {/* Sobre uno mismo no hay acciones: no se puede cambiar el propio rol ni desactivarse */}
        {!user.isSelf && (
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className={ACTION_BUTTON}
              disabled={isPending}
              aria-label={nextRole === 'admin' ? `Hacer admin a ${user.email}` : `Quitar admin a ${user.email}`}
              onClick={() => run(() => updateUserRoleAction({ userId: user.id, role: nextRole }))}
            >
              {nextRole === 'admin' ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldOff className="h-3.5 w-3.5" />}
              {nextRole === 'admin' ? 'Hacer admin' : 'Quitar admin'}
            </button>

            {user.status === 'pending' && (
              <button
                type="button"
                className={ACTION_BUTTON}
                disabled={isPending}
                aria-label={`Reenviar invitación a ${user.email}`}
                onClick={() => run(() => resendInviteAction({ userId: user.id }))}
              >
                <MailPlus className="h-3.5 w-3.5" />
                Reenviar
              </button>
            )}

            {user.status === 'disabled' ? (
              <button
                type="button"
                className={ACTION_BUTTON}
                disabled={isPending}
                aria-label={`Reactivar a ${user.email}`}
                onClick={() => run(() => setUserActiveAction({ userId: user.id, active: true }))}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reactivar
              </button>
            ) : (
              <button
                type="button"
                className={`${ACTION_BUTTON} hover:border-destructive/50 hover:text-destructive`}
                disabled={isPending}
                aria-label={`Desactivar a ${user.email}`}
                onClick={() => run(() => setUserActiveAction({ userId: user.id, active: false }))}
              >
                <Ban className="h-3.5 w-3.5" />
                Desactivar
              </button>
            )}
          </div>
        )}
      </td>
    </tr>
  )
}
