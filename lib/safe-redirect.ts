// Origin ficticio: solo sirve para que URL resuelva rutas relativas igual que un navegador
const BASE = 'http://internal.invalid'

/**
 * Devuelve `next` solo si es una ruta interna; si no, `fallback`. Evita open redirects.
 * Se resuelve como lo haría el navegador (que trata "\" como "/"), así que
 * https://evil.com, //evil.com y /\evil.com terminan en otro origin y se descartan.
 */
export function safeInternalPath(next: unknown, fallback = '/dashboard') {
  if (typeof next !== 'string' || next === '') return fallback
  try {
    const url = new URL(next, BASE)
    if (url.origin !== BASE) return fallback
    return `${url.pathname}${url.search}`
  } catch {
    return fallback
  }
}
