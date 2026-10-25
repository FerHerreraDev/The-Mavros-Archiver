import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Rate limit compartido en Postgres (OPS-01..OPS-03). Ver migración 20261025000006.
 * 5 intentos por minuto por clave, igual que antes (AUTH-04).
 *
 * Falla cerrado: si el contador no responde, la acción se bloquea.
 */
export const RATE_LIMIT_MAX = 5
export const RATE_LIMIT_WINDOW_SECONDS = 60

export async function limitWith(key: string, max: number, windowSeconds: number) {
  try {
    const { data, error } = await createAdminClient()
      .rpc('rate_limit_hit', { p_key: key, p_max: max, p_window_seconds: windowSeconds })
      .single<{ allowed: boolean; remaining: number }>()
    if (error || !data) throw new Error(error?.message ?? 'sin respuesta')
    return { success: data.allowed, remaining: data.remaining }
  } catch (err) {
    console.error('[RATE LIMIT] Contador no disponible, se bloquea:', (err as Error).message)
    return { success: false, remaining: 0 }
  }
}

export const ratelimit = {
  limit: (key: string) => limitWith(key, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_SECONDS),
}
