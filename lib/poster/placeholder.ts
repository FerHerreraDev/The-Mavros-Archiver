import { thumbHashToDataURL } from 'thumbhash'

/**
 * ThumbHash (base64) -> imagen PNG diminuta como data URL para usar de fondo mientras carga
 * el póster real (LOAD-02). Hash ausente o corrupto -> null (se queda el color de tarjeta).
 */
export function thumbhashDataUrl(hash: string | null | undefined): string | null {
  if (!hash) return null
  try {
    const bytes = Uint8Array.from(atob(hash), (c) => c.charCodeAt(0))
    if (bytes.length < 5) return null
    return thumbHashToDataURL(bytes)
  } catch {
    return null
  }
}
