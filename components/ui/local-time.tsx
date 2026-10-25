'use client'

import { useSyncExternalStore } from 'react'

const noopSubscribe = () => () => {}

/**
 * Fecha en la zona horaria del navegador.
 * En el servidor (y en la primera hidratación) muestra la fecha ISO corta para no
 * provocar un mismatch de hidratación por zona horaria distinta.
 */
export function LocalTime({ iso, fallback = '—' }: { iso: string | null; fallback?: string }) {
  const isClient = useSyncExternalStore(noopSubscribe, () => true, () => false)

  if (!iso) return <span className="text-muted-foreground">{fallback}</span>

  const text = isClient
    ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
    : iso.slice(0, 10)

  return <time dateTime={iso}>{text}</time>
}
