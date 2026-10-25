import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/guards'
import { userStatus } from '@/lib/user-status'
import { StatusBadge, RoleBadge } from '@/components/ui/status-badge'
import { LocalTime } from '@/components/ui/local-time'

export const metadata = { title: 'Perfil - The Mavros Archiver' }

export default async function ProfilePage() {
  const session = await getSessionUser()
  if (!session) redirect('/login')

  const { user, role } = session

  // Todo sale de la sesión del servidor: no hay parámetro en la URL que permita ver a otro
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: 'Email', value: user.email },
    { label: 'User ID', value: <span className="font-mono text-xs break-all">{user.id}</span> },
    { label: 'Rol', value: <RoleBadge role={role} /> },
    { label: 'Estado', value: <StatusBadge status={userStatus(user)} /> },
    { label: 'Miembro desde', value: <LocalTime iso={user.created_at} /> },
    { label: 'Último acceso', value: <LocalTime iso={user.last_sign_in_at ?? null} /> },
  ]

  return (
    <div className="max-w-2xl space-y-8 animate-in fade-in duration-500">
      <div>
        <span className="text-xs font-mono text-muted-foreground uppercase tracking-wide">Account</span>
        <h2 className="text-2xl font-bold tracking-tight">Tu perfil</h2>
      </div>

      <dl className="bg-card/50 backdrop-blur-xl border border-border rounded-2xl divide-y divide-border">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between px-6 py-4">
            <dt className="text-xs font-mono uppercase tracking-wide text-muted-foreground">{label}</dt>
            <dd className="text-sm text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
