// Token de reproducción (PLY-01, PLY-02 de tests/SPEC.md).
// Lo firma el servidor de la app y lo verifica el Worker. Solo usa Web Crypto,
// así corre igual en Node, en Cloudflare Workers y es fácil de replicar en Kotlin.
//
// Formato:  v1.<exp unix s>.<carpeta en base64url>.<firma HMAC-SHA256 en base64url>

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

export async function signPlaybackToken(opts: { prefix: string; expiresAt: number; secret: string }) {
  if (!opts.prefix.endsWith('/') || opts.prefix.split('/').includes('..')) throw new Error('Carpeta inválida')
  const payload = `v1.${Math.floor(opts.expiresAt)}.${toBase64Url(encoder.encode(opts.prefix))}`
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(opts.secret), encoder.encode(payload))
  return `${payload}.${toBase64Url(new Uint8Array(signature))}`
}

export type TokenCheck = { ok: true; prefix: string; expiresAt: number } | { ok: false; reason: string }

export async function verifyPlaybackToken(token: string, secret: string, nowSeconds = Date.now() / 1000): Promise<TokenCheck> {
  const parts = token.split('.')
  if (parts.length !== 4 || parts[0] !== 'v1') return { ok: false, reason: 'formato' }
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
