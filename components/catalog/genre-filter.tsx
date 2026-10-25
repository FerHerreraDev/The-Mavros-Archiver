import Link from 'next/link'
import { cn } from '@/lib/utils'

const CHIP =
  'shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

/** Chips de género que viven en la URL (?genre=…) (CAT-04) */
export function GenreFilter({ genres, active }: { genres: string[]; active?: string }) {
  if (genres.length === 0) return null

  const chip = (label: string, href: string, isActive: boolean) => (
    <Link
      key={label}
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        CHIP,
        isActive
          ? 'border-accent bg-accent/15 text-foreground'
          : 'border-border bg-card/50 text-muted-foreground hover:text-foreground hover:border-foreground/30'
      )}
    >
      {label}
    </Link>
  )

  return (
    <nav aria-label="Filtrar por género" className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
      {chip('Todas', '/dashboard', !active)}
      {genres.map((g) => chip(g, `/dashboard?genre=${encodeURIComponent(g)}`, active === g))}
    </nav>
  )
}
