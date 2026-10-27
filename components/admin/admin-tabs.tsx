'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Users, Clapperboard, Tv } from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
  { href: '/dashboard/admin', label: 'Usuarios', icon: Users, match: (p: string) => p === '/dashboard/admin' },
  { href: '/dashboard/admin/movies', label: 'Películas', icon: Clapperboard, match: (p: string) => p.startsWith('/dashboard/admin/movies') },
  { href: '/dashboard/admin/series', label: 'Series', icon: Tv, match: (p: string) => p.startsWith('/dashboard/admin/series') },
]

export function AdminTabs() {
  const pathname = usePathname()

  return (
    <nav aria-label="Secciones de administración" className="flex gap-2 border-b border-border">
      {TABS.map(({ href, label, icon: Icon, match }) => {
        const active = match(pathname)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-2 px-4 py-2 -mb-px text-sm font-medium border-b-2 transition-colors',
              active ? 'border-accent text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
