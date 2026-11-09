// Token de reproducción (PLY-01, PLY-02 de tests/SPEC.md).
// Lo firma el servidor de la app y lo verifica el Worker. Solo usa Web Crypto,
// así corre igual en Node, en Cloudflare Workers y es fácil de replicar en Kotlin.
//
// Formato:  v1.<exp unix s>.<carpeta en base64url>.<firma HMAC-SHA256 en base64url>
// Los tokens de borrado (PLY-10) usan "p1" en vez de "v1": la versión va firmada, así que un token
// de reproducción nunca sirve para borrar ni uno de borrado para reproducir.

const encoder = new TextEncoder()
export const MIN_SECRET_LENGTH = 32

function toBase64Url(bytes: Uint8Array) {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string) {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new Error('base64url inválido')
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4)
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
}

async function hmacKey(secret: string) {
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`El secreto del token debe tener al menos ${MIN_SECRET_LENGTH} caracteres`)
  }
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

/** "movies/peli/master.m3u8" -> "movies/peli/" (una película = una carpeta) */
export function moviePrefix(hlsPath: string) {
  const i = hlsPath.lastIndexOf('/')
  if (i <= 0) throw new Error('El video debe estar dentro de una carpeta propia (ej. movies/<slug>/master.m3u8)')
  return hlsPath.slice(0, i + 1)
}

/**
 * Carpeta que se puede borrar entera (PLY-10): al menos dos niveles ("movies/<slug>/"), para que
 * nunca se pueda pedir borrar "movies/" completo, y solo caracteres de rutas de video.
 */
export function isPurgeablePrefix(prefix: string) {
  if (!/^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)+\/$/.test(prefix)) return false
  return !prefix.split('/').some((s) => s === '.' || s === '..')
}

type TokenVersion = 'v1' | 'p1'

async function signToken(version: TokenVersion, opts: { prefix: string; expiresAt: number; secret: string }) {
  if (!opts.prefix.endsWith('/') || opts.prefix.split('/').includes('..')) throw new Error('Carpeta inválida')
  const payload = `${version}.${Math.floor(opts.expiresAt)}.${toBase64Url(encoder.encode(opts.prefix))}`
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(opts.secret), encoder.encode(payload))
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`
}

export function signPlaybackToken(opts: { prefix: string; expiresAt: number; secret: string }) {
  return signToken('v1', opts)
}

/** Token para borrar TODOS los archivos de la carpeta de una película (PLY-10). Debe durar poco. */
export function signPurgeToken(opts: { prefix: string; expiresAt: number; secret: string }) {
  return signToken('p1', opts)
}

export type TokenCheck = { ok: true; prefix: string; expiresAt: number } | { ok: false; reason: string }

export function verifyPlaybackToken(token: string, secret: string, nowSeconds = Date.now() / 1000) {
  return verifyToken('v1', token, secret, nowSeconds)
}

export function verifyPurgeToken(token: string, secret: string, nowSeconds = Date.now() / 1000) {
  return verifyToken('p1', token, secret, nowSeconds)
}

async function verifyToken(expected: TokenVersion, token: string, secret: string, nowSeconds: number): Promise<TokenCheck> {
  const parts = token.split('.')
  if (parts.length !== 4 || parts[0] !== expected) return { ok: false, reason: 'formato' }
  const [version, exp, prefixB64, signatureB64] = parts

  if (!/^\d+$/.test(exp)) return { ok: false, reason: 'formato' }

  let signature: Uint8Array
  let prefix: string
  try {
    signature = fromBase64Url(signatureB64)
    prefix = new TextDecoder('utf-8', { fatal: true }).decode(fromBase64Url(prefixB64))
  } catch {
    return { ok: false, reason: 'formato' }
  }

  // crypto.subtle.verify compara en tiempo constante
  const valid = await crypto.subtle.verify(
    'HMAC',
    await hmacKey(secret),
    signature as Uint8Array<ArrayBuffer>,
    encoder.encode(`${version}.${exp}.${prefixB64}`)
  )
  if (!valid) return { ok: false, reason: 'firma' }

  const expiresAt = Number(exp)
  if (expiresAt <= nowSeconds) return { ok: false, reason: 'caducado' }
  if (!prefix.endsWith('/') || prefix.split('/').includes('..')) return { ok: false, reason: 'carpeta' }

  return { ok: true, prefix, expiresAt }
}
