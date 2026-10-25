'use client'

import { useEffect } from 'react'
import { RotateCcw } from 'lucide-react'
import { StatusPage } from '@/components/ui/status-page'

// Nunca muestra el mensaje técnico del error al usuario (OPS-06); solo el digest para soporte
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[DASHBOARD] Error inesperado:', error)
  }, [error])

  return (
    <StatusPage
      code={error.digest ? `ERROR · ${error.digest}` : 'ERROR'}
      title="Algo salió mal"
      message="No pudimos cargar esta sección. Intenta de nuevo en un momento."
      action={
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-5 py-2 text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <RotateCcw className="h-4 w-4" /> Reintentar
        </button>
      }
    />
  )
}
