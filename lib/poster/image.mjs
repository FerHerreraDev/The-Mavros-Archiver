// Procesado de imágenes compartido por el servidor (lib/poster/thumbhash.ts) y la carpeta de la Mac
// (scripts/movie-inbox.mjs). sharp es nativo: se carga al usarlo, no al importar (LOAD-03).
import { createHash } from 'node:crypto'
import { rgbaToThumbHash } from 'thumbhash'

// Imágenes enormes o "bombas" de descompresión: sharp se niega antes de decodificarlas
const MAX_INPUT_PIXELS = 40_000_000

export const POSTERS_BUCKET = 'posters'
/** Póster vertical (LOAD-07) */
export const POSTER_MAX_WIDTH = 600
/** Imagen horizontal de una serie, película o episodio (SER-17, SER-18, TMDB-06) */
export const BACKDROP_MAX_WIDTH = 1280
/** Logo del título (TMDB-06) */
export const LOGO_MAX_WIDTH = 500

/** ThumbHash (base64) de una imagen. ThumbHash pide ≤100 px por lado. */
export async function thumbhashFromImage(bytes) {
  const { default: sharp } = await import('sharp')
  const { data, info } = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate() // respeta la orientación EXIF
    .resize(100, 100, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return Buffer.from(rgbaToThumbHash(info.width, info.height, data)).toString('base64')
}

/**
 * "#rrggbb" para teñir la portada (TMDB-07): el color dominante con la luminosidad acotada a
 * 22–45 %, para que sobre el fondo oscuro se note sin tapar el texto blanco.
 */
export function toAccentHex({ r, g, b }) {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255]
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  const d = max - min
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  let h = 0
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6
    else if (max === gn) h = (bn - rn) / d + 2
    else h = (rn - gn) / d + 4
  }
  h = (h * 60 + 360) % 360
  const L = Math.min(0.45, Math.max(0.22, l))
  const c = (1 - Math.abs(2 * L - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = L - c / 2
  const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return '#' + [r1, g1, b1].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('')
}

/** Color de una imagen para la portada (TMDB-07); null si no se puede leer */
export async function accentColor(bytes) {
  try {
    const { default: sharp } = await import('sharp')
    const { dominant } = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS }).resize(64, 64, { fit: 'inside' }).stats()
    return toAccentHex(dominant)
  } catch (err) {
    console.warn('[POSTER] Sin color:', err.message)
    return null
  }
}

/** Copia optimizada: WebP, máx. [maxWidth] px de ancho, sin agrandar, sin metadatos */
export async function optimizeImage(bytes, maxWidth = POSTER_MAX_WIDTH) {
  const { default: sharp } = await import('sharp')
  return sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize({ width: maxWidth, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer()
}

/** Nombre en el bucket: hash del contenido (la misma imagen no se duplica y se cachea un año) */
export function imageObjectPath(image) {
  return `${createHash('sha256').update(image).digest('hex').slice(0, 32)}.webp`
}

/** Sube la copia al bucket `posters` y devuelve su URL pública; null si falla */
export async function uploadImage(supabase, image) {
  const path = imageObjectPath(image)
  const { error } = await supabase.storage
    .from(POSTERS_BUCKET)
    .upload(path, image, { contentType: 'image/webp', cacheControl: '31536000', upsert: true })
  if (error) {
    console.warn('[POSTER] No se pudo subir la copia:', error.message)
    return null
  }
  return supabase.storage.from(POSTERS_BUCKET).getPublicUrl(path).data.publicUrl
}

/** Vista previa + copia optimizada de unos bytes; lo que falle queda en null */
export async function processImageBytes(bytes, maxWidth = POSTER_MAX_WIDTH) {
  const [thumbhash, image] = await Promise.all([
    thumbhashFromImage(bytes).catch((err) => (console.warn('[POSTER] Sin vista previa:', err.message), null)),
    optimizeImage(bytes, maxWidth).catch((err) => (console.warn('[POSTER] Sin copia optimizada:', err.message), null)),
  ])
  return { thumbhash, image }
}
