import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth/guards'
import { AdminTabs } from '@/components/admin/admin-tabs'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Layout y páginas se renderizan en paralelo: cada página vuelve a verificar el rol
  const session = await getSessionUser()
  if (!session) redirect('/login')
  if (session.role !== 'admin') redirect('/dashboard')

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <span className="text-xs font-mono text-muted-foreground uppercase tracking-wide">Command Center</span>
        <h2 className="text-2xl font-bold tracking-tight">Administración</h2>
        <p className="text-muted-foreground">Invita personas, controla quién tiene acceso y administra la bóveda.</p>
      </div>
      <AdminTabs />
      {children}
    </div>
  )
}
