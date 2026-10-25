import { CookieJar } from './cookie-jar'

/**
 * Request "actual" que ven los mocks de next/headers en las pruebas de integración.
 * Cada prueba lo reinicia con resetRequest().
 */
export const requestContext = {
  cookies: new CookieJar(),
  headers: new Headers(),
}

export function resetRequest(opts: { ip?: string; origin?: string; cookies?: CookieJar } = {}) {
  requestContext.cookies = opts.cookies ?? new CookieJar()
  requestContext.headers = new Headers()
  if (opts.ip) requestContext.headers.set('x-forwarded-for', opts.ip)
  if (opts.origin) requestContext.headers.set('origin', opts.origin)
}

/**
 * Ejecuta una Server Action / route handler y devuelve a dónde redirigió (o null).
 * redirect() de Next lanza un error con digest "NEXT_REDIRECT;<type>;<url>;<status>;"
 */
export async function runAndCaptureRedirect<T>(fn: () => Promise<T>): Promise<{ redirect: string | null; result?: T }> {
  try {
    const result = await fn()
    return { redirect: null, result }
  } catch (err) {
    const digest = (err as { digest?: unknown })?.digest
    if (typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT;')) {
      return { redirect: digest.split(';')[2] }
    }
    throw err
  }
}

export function formData(fields: Record<string, string>) {
  const fd = new FormData()
  Object.entries(fields).forEach(([k, v]) => fd.set(k, v))
  return fd
}
