import 'server-only'
import { headers } from 'next/headers'

/**
 * URL base del sitio para links en correos (invitación, recuperación).
 * Prioridad: NEXT_PUBLIC_SITE_URL > dominio de producción en Vercel > origin del request > localhost.
 * En Vercel nunca se usa el origin: si el admin invita desde una URL de deployment
 * (protegida por Vercel), el invitado terminaría en "inicia sesión en Vercel" (UTIL-02).
 * Supabase solo acepta redirects que estén en Auth > URL Configuration > Redirect URLs.
 */
export async function getSiteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
  }

  // Vercel lo define solo en cada deployment: el dominio público de producción, sin protocolo
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.replace(/^https?:\/\//, '').replace(/\/$/, '')
  if (production) return `https://${production}`

  const headersList = await headers()
  const origin = headersList.get('origin')
  if (origin) return origin

  const host = headersList.get('x-forwarded-host') ?? headersList.get('host')
  if (host) {
    const proto = headersList.get('x-forwarded-proto') ?? 'http'
    return `${proto}://${host}`
  }

  return 'http://localhost:3000'
}
