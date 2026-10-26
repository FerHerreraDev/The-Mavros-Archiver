// Códigos del login para TV (DEV-01, DEV-03, DEV-07). Solo Web Crypto: corre igual en Node y en el Edge.

/** Sin 0 O 1 I L: nada que se confunda al leerlo en una tele y escribirlo en el teléfono */
export const USER_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const USER_CODE_LENGTH = 8
export const DEVICE_CODE_TTL_SECONDS = 600
export const DEVICE_POLL_INTERVAL_SECONDS = 5

function toBase64Url(bytes: Uint8Array) {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** 8 caracteres uniformes del alfabeto (muestreo por rechazo: sin sesgo de módulo) */
export function generateUserCode(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  const limit = 256 - (256 % USER_CODE_ALPHABET.length)
  let code = ''
  while (code.length < USER_CODE_LENGTH) {
    for (const byte of random(16)) {
      if (byte < limit && code.length < USER_CODE_LENGTH) code += USER_CODE_ALPHABET[byte % USER_CODE_ALPHABET.length]
    }
  }
  return code
}

/** "k7q4 mx2p", "K7Q4-MX2P" -> "K7Q4MX2P"; null si no puede ser un código válido */
export function normalizeUserCode(input: string | null | undefined) {
  if (!input) return null
  const code = input.toUpperCase().replace(/[\s-]/g, '')
  if (code.length !== USER_CODE_LENGTH) return null
  for (const ch of code) if (!USER_CODE_ALPHABET.includes(ch)) return null
  return code
}

/** "K7Q4MX2P" -> "K7Q4-MX2P" */
export function formatUserCode(code: string) {
  return `${code.slice(0, 4)}-${code.slice(4)}`
}

/** Secreto que solo conoce la tele: 256 bits */
export function generateDeviceCode() {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)))
}

/** Lo que se guarda en la base (nunca el device_code en claro) */
export async function hashDeviceCode(deviceCode: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(deviceCode))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Nombre que la tele dice tener: texto plano corto, sin caracteres de control */
export function sanitizeClientName(input: unknown) {
  if (typeof input !== 'string') return 'TV'
  const clean = input.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim().slice(0, 60)
  return clean || 'TV'
}
