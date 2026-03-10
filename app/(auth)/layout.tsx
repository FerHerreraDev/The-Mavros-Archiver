import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Authentication - The Mavros Archiver',
  description: 'Private access to The Mavros Archiver',
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {/* Glassmorphism card container */}
      <div className="w-full max-w-md">
        {/* Logo and badge */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold tracking-tighter mb-2 text-foreground">
            THE MAVROS{' '}
            <span className="text-accent">ARCHIVER</span>
          </h1>
          <span className="inline-block text-xs font-mono text-muted-foreground uppercase tracking-wide border border-border px-3 py-1 rounded">
            PRIVATE ACCESS
          </span>
        </div>

        {/* Card with glassmorphism */}
        <div className="bg-card/50 backdrop-blur-xl border border-border rounded-2xl p-8">
          {children}
        </div>

        {/* Footer text */}
        <p className="text-center text-xs text-muted-foreground mt-6">
          Secure authentication powered by Supabase
        </p>
      </div>
    </div>
  )
}
