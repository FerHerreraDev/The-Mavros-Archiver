'use client'

import { useFormStatus } from 'react-dom'
import { LogOut } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'

/** "Salir" bloqueado y con indicador mientras se cierra la sesión (UX-01) */
export function LogoutButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending || undefined}
      className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors sm:ml-4 border-l border-border pl-4 disabled:opacity-60"
    >
      {pending ? <Spinner className="w-4 h-4" /> : <LogOut className="w-4 h-4" />} <span className="sr-only sm:not-sr-only">Salir</span>
    </button>
  )
}
