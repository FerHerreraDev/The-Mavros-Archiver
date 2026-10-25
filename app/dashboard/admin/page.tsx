import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/guards'
import { listUsersForAdmin } from '@/lib/data/admin-users'
import { InviteUserForm } from '@/components/admin/invite-user-form'
import { UsersTable } from '@/components/admin/users-table'

export const metadata = { title: 'Admin - The Mavros Archiver' }

export default async function AdminPage() {
  // Verificación en el servidor: ocultar el enlace del navbar no basta
  const session = await getSessionUser()
  if (!session) redirect('/login')
  if (session.role !== 'admin') redirect('/dashboard')

  const users = await listUsersForAdmin()
  if (!users) redirect('/dashboard')

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <span className="text-xs font-mono text-muted-foreground uppercase tracking-wide">Command Center</span>
        <h2 className="text-2xl font-bold tracking-tight">Administración</h2>
        <p className="text-muted-foreground">Invita personas y controla quién tiene acceso a la bóveda.</p>
      </div>

      <InviteUserForm />
      <UsersTable users={users} />
    </div>
  )
}
