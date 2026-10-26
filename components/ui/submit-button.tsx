'use client'

import type { ComponentProps } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

/**
 * Botón de envío para formularios con Server Action (<form action={…}>): mientras se envía,
 * TODOS los botones del formulario quedan deshabilitados y el que se tocó muestra el indicador.
 * Así un doble clic no manda los datos dos veces (UX-01).
 */
export function SubmitButton({ children, disabled, ...props }: ComponentProps<typeof Button>) {
  const { pending, data } = useFormStatus()
  // Si el formulario tiene varios botones (Aprobar / Rechazar), el indicador va solo en el tocado
  const mine = pending && (!props.name || data?.get(props.name) === props.value)
  return (
    <Button type="submit" disabled={pending || disabled} aria-busy={mine || undefined} {...props}>
      {mine && <Spinner className="h-4 w-4" />}
      {children}
    </Button>
  )
}
