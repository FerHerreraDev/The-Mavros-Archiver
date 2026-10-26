'use client'

import type { ReactNode } from 'react'
import { useLinkStatus } from 'next/link'
import { Loader2 } from 'lucide-react'

/**
 * Va DENTRO de un <Link>: muestra su icono normal y, mientras la página destino carga,
 * un indicador girando anunciado como "Cargando…" (MOV-14). Sin loading.tsx: ese archivo
 * convertiría los 404 de notFound() en 200 (ver catalog-skeleton.tsx).
 */
export function LinkPendingIcon({ children, className = 'h-3.5 w-3.5' }: { children: ReactNode; className?: string }) {
  const { pending } = useLinkStatus()
  if (!pending) return <>{children}</>
  return (
    <>
      <Loader2 aria-hidden className={`${className} animate-spin motion-reduce:animate-none`} />
      <span className="sr-only" role="status">
        Cargando…
      </span>
    </>
  )
}
