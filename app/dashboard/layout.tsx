import { getSessionUser } from '@/lib/auth/guards'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Film, ListVideo, User, Shield } from 'lucide-react'
import { logoutAction } from '@/lib/actions/auth.actions'
import { LogoutButton } from '@/components/auth/logout-button'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSessionUser()

  if (!session) {
    redirect('/login')
  }

  // Solo decide si se pinta el enlace; /dashboard/admin vuelve a verificar el rol
  const isAdmin = session.role === 'admin'

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Navbar Superior estilo Netflix */}
      <header className="border-b border-border bg-card/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <Link href="/dashboard" className="text-base sm:text-xl font-bold tracking-tighter uppercase whitespace-nowrap">
            The Mavros <span className="text-red-500">Archiver</span>
          </Link>
          
          {/* En móvil solo íconos; el texto queda como sr-only para lectores de pantalla */}
          <nav className="flex items-center gap-4 sm:gap-6 text-sm font-medium">
            <Link href="/dashboard" className="flex items-center gap-2 hover:text-red-500 transition-colors">
              <Film className="w-4 h-4" /> <span className="sr-only sm:not-sr-only">Catálogo</span>
            </Link>
            
            <Link href="/dashboard/lists" className="flex items-center gap-2 hover:text-red-500 transition-colors">
              <ListVideo className="w-4 h-4" /> <span className="sr-only sm:not-sr-only">Mis listas</span>
            </Link>

            <Link href="/dashboard/profile" className="flex items-center gap-2 hover:text-red-500 transition-colors">
              <User className="w-4 h-4" /> <span className="sr-only sm:not-sr-only">Perfil</span>
            </Link>
            
            {isAdmin && (
              <Link href="/dashboard/admin" className="flex items-center gap-2 text-primary hover:text-primary/80 transition-colors">
                <Shield className="w-4 h-4" /> <span className="sr-only sm:not-sr-only">Admin</span>
              </Link>
            )}

            {/* Botón de Logout */}
            <form action={logoutAction}>
              <LogoutButton />
            </form>
          </nav>
        </div>
      </header>

      {/* Aquí se renderizarán las páginas (Catálogo, Perfil o Admin) */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-8">
        {children}
      </main>
    </div>
  )
}
