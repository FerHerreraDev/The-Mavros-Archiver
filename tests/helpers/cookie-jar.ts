type CookieOptions = { maxAge?: number; expires?: Date | number | string } & Record<string, unknown>

/**
 * Almacén de cookies en memoria con la misma forma que `cookies()` de next/headers.
 * Simula el navegador entre requests en las pruebas de integración.
 */
export class CookieJar {
  private store = new Map<string, string>()

  get(name: string) {
    const value = this.store.get(name)
    return value === undefined ? undefined : { name, value }
  }

  getAll() {
    return [...this.store.entries()].map(([name, value]) => ({ name, value }))
  }

  has(name: string) {
    return this.store.has(name)
  }

  set(nameOrCookie: string | { name: string; value: string } & CookieOptions, value?: string, options?: CookieOptions) {
    const cookie = typeof nameOrCookie === 'string' ? { name: nameOrCookie, value: value ?? '', ...options } : nameOrCookie
    const expired =
      cookie.maxAge === 0 ||
      (cookie.expires !== undefined && new Date(cookie.expires as string).getTime() <= Date.now())

    if (expired || cookie.value === '') {
      this.store.delete(cookie.name)
    } else {
      this.store.set(cookie.name, cookie.value)
    }
    return this
  }

  delete(name: string) {
    this.store.delete(name)
    return this
  }

  /** ¿Hay una cookie de sesión de Supabase? (sb-<ref>-auth-token, posiblemente partida en .0/.1) */
  hasSupabaseSession() {
    return [...this.store.keys()].some((name) => /^sb-.+-auth-token(\.\d+)?$/.test(name))
  }

  toHeader() {
    return this.getAll()
      .map(({ name, value }) => `${name}=${value}`)
      .join('; ')
  }
}
