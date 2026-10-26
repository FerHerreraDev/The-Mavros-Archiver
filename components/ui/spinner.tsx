import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Indicador girando para botones ocupados (UX-01). Anunciado como "Cargando…" a lectores de pantalla. */
export function Spinner({ className }: { className?: string }) {
  return (
    <>
      <Loader2 aria-hidden data-testid="spinner" className={cn('h-3.5 w-3.5 animate-spin motion-reduce:animate-none', className)} />
      <span className="sr-only">Cargando…</span>
    </>
  )
}
