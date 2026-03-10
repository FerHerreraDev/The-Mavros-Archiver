import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { logoutAction } from '@/lib/actions/auth.actions'

export default async function DashboardPage() {
  const supabase = await createClient()
  
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">
              THE MAVROS <span className="text-accent">ARCHIVER</span>
            </h1>
            <p className="text-muted-foreground">Welcome back, {user.email}</p>
          </div>
          
          <form action={logoutAction}>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-card transition-colors"
            >
              Sign Out
            </button>
          </form>
        </div>

        {/* Content */}
        <div className="bg-card border border-border rounded-2xl p-8">
          <h2 className="text-xl font-semibold text-foreground mb-4">Dashboard</h2>
          <p className="text-muted-foreground mb-6">
            This is a protected route. Only authenticated users can access this page.
          </p>

          {/* User Info */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-muted-foreground uppercase tracking-wide w-24">
                Email:
              </span>
              <span className="text-sm text-foreground">{user.email}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-muted-foreground uppercase tracking-wide w-24">
                User ID:
              </span>
              <span className="text-sm text-foreground font-mono">{user.id}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-muted-foreground uppercase tracking-wide w-24">
                Status:
              </span>
              <span className="inline-flex items-center gap-2 text-sm">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                <span className="text-foreground">Active</span>
              </span>
            </div>
          </div>
        </div>

        {/* Next Steps */}
        <div className="mt-6 p-4 bg-muted/50 border border-border rounded-lg">
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">Next:</span> Admin panel for user management will be added here.
          </p>
        </div>
      </div>
    </div>
  )
}
