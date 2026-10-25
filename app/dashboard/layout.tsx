import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Film, User, Shield, LogOut } from 'lucide-react'
import { logoutAction } from '@/lib/actions/auth.actions' // Asumiendo que así se llama tu acción de logout

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    redirect('/login')
  }

  // Verificamos el rol para saber si pintamos el botón de Admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const isAdmin = profile?.role === 'admin'

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Navbar Superior estilo Netflix */}
      <header className="border-b border-border bg-card/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/dashboard" className="text-xl font-bold tracking-tighter uppercase">
            The Mavros <span className="text-red-500">Archiver</span>
          </Link>
          
          <nav className="flex items-center gap-6 text-sm font-medium">
            <Link href="/dashboard" className="flex items-center gap-2 hover:text-red-500 transition-colors">
              <Film className="w-4 h-4" /> Catálogo
            </Link>
            
            <Link href="/dashboard/profile" className="flex items-center gap-2 hover:text-red-500 transition-colors">
              <User className="w-4 h-4" /> Perfil
            </Link>
            
            {isAdmin && (
              <Link href="/dashboard/admin" className="flex items-center gap-2 text-primary hover:text-primary/80 transition-colors">
                <Shield className="w-4 h-4" /> Admin
              </Link>
            )}

            {/* Botón de Logout */}
            <form action={logoutAction}>
              <button type="submit" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors ml-4 border-l border-border pl-4">
                <LogOut className="w-4 h-4" /> Salir
              </button>
            </form>
          </nav>
        </div>
      </header>

      {/* Aquí se renderizarán las páginas (Catálogo, Perfil o Admin) */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8">
        {children}
      </main>
    </div>
  )
}
