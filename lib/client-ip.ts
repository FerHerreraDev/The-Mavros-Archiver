/**
 * IP del cliente para el rate limit (OPS-04).
 *
 * Primero los headers que pone la plataforma y el cliente no controla
 * (Vercel: x-vercel-forwarded-for / x-real-ip). Si no hay, el PRIMER valor de
 * x-forwarded-for: lo que un cliente agregue detrás no cambia la clave.
 */
export function clientIp(headers: Headers) {
  const first = (value: string | null) => value?.split(',')[0]?.trim() || null
  return (
    first(headers.get('x-vercel-forwarded-for')) ??
    first(headers.get('x-real-ip')) ??
    first(headers.get('x-forwarded-for')) ??
    'unknown'
  )
}
