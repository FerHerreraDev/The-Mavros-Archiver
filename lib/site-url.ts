import 'server-only'
import { headers } from 'next/headers'

/**
 * URL base del sitio para links en correos (invitación, recuperación).
 * Prioridad: NEXT_PUBLIC_SITE_URL > origin del request > localhost.
 * Supabase solo acepta redirects que estén en Auth > URL Configuration > Redirect URLs.
 */
export async function getSiteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '')
  }

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
