'use client'

import { useState, useTransition } from 'react'
import { Send } from 'lucide-react'
import { requestMovieAction, type RequestActionResult } from '@/lib/actions/request.actions'
import { Spinner } from '@/components/ui/spinner'

/** "Pedir «…»" cuando la búsqueda no encuentra nada (SRCH-03, REQ-03) */
export function RequestButton({ title }: { title: string }) {
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<RequestActionResult | null>(null)

  if (result?.success) {
    return (
      <p className="text-sm text-foreground" role="status">
        {result.success}
      </p>
    )
  }
  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={isPending}
        aria-busy={isPending || undefined}
        onClick={() =>
          startTransition(async () => {
            try {
              setResult(await requestMovieAction({ title }))
            } catch {
              setResult({ error: 'Error de red. Revisa tu conexión.' })
            }
          })
        }
        className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {isPending ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
        Pedir «{title}»
      </button>
      {result?.error && (
        <p className="text-sm text-destructive" role="alert">
          {result.error}
        </p>
      )}
    </div>
  )
}
