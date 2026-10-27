// Procesado de imágenes compartido por el servidor (lib/poster/thumbhash.ts) y la carpeta de la Mac
// (scripts/movie-inbox.mjs). sharp es nativo: se carga al usarlo, no al importar (LOAD-03).
import { createHash } from 'node:crypto'
import { rgbaToThumbHash } from 'thumbhash'

// Imágenes enormes o "bombas" de descompresión: sharp se niega antes de decodificarlas
const MAX_INPUT_PIXELS = 40_000_000

export const POSTERS_BUCKET = 'posters'
/** Póster vertical (LOAD-07) */
export const POSTER_MAX_WIDTH = 600
/** Imagen horizontal de una serie o de un episodio (SER-17, SER-18) */
export const BACKDROP_MAX_WIDTH = 1280

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
