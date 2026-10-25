import type { UserStatus, Role } from '@/lib/user-status'
import { cn } from '@/lib/utils'

const STATUS: Record<UserStatus, { label: string; className: string }> = {
  active: { label: 'Activo', className: 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10' },
  pending: { label: 'Pendiente', className: 'border-amber-500/40 text-amber-400 bg-amber-500/10' },
  disabled: { label: 'Desactivado', className: 'border-destructive/50 text-destructive bg-destructive/10' },
}

const BADGE = 'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-mono uppercase tracking-wide'

export function StatusBadge({ status }: { status: UserStatus }) {
  const { label, className } = STATUS[status]
  return <span className={cn(BADGE, className)}>{label}</span>
}

export function RoleBadge({ role }: { role: Role }) {
  return (
    <span
      className={cn(
        BADGE,
        role === 'admin' ? 'border-accent/50 text-accent bg-accent/10' : 'border-border text-muted-foreground'
      )}
    >
      {role}
    </span>
  )
}
