import 'server-only'
import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { rgbaToThumbHash } from 'thumbhash'
import { fetchPosterBytes, type FetchPosterOptions } from './fetch-poster'

// Imágenes enormes o "bombas" de descompresión: sharp se niega antes de decodificarlas
const MAX_INPUT_PIXELS = 40_000_000

/** ThumbHash (base64) de una imagen. ThumbHash pide ≤100 px por lado. */
export async function thumbhashFromImage(bytes: Buffer): Promise<string> {
  // sharp es nativo: se carga aquí y no al importar el módulo. Si su binario falla en el servidor,
  // solo falla la vista previa; la página de edición y el guardado siguen funcionando (LOAD-03)
  const { default: sharp } = await import('sharp')
  const { data, info } = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate() // respeta la orientación EXIF
    .resize(100, 100, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return Buffer.from(rgbaToThumbHash(info.width, info.height, data)).toString('base64')
}

export const POSTER_MAX_WIDTH = 600
export const POSTERS_BUCKET = 'posters'

/** Copia optimizada (LOAD-07): WebP, máx. 600 px de ancho, sin agrandar, sin metadatos */
export async function optimizePoster(bytes: Buffer): Promise<Buffer> {
  const { default: sharp } = await import('sharp')
  return sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize({ width: POSTER_MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer()
}

export type ProcessedPoster = { thumbhash: string | null; image: Buffer | null }

/**
 * Descarga el póster UNA vez y saca la vista previa (LOAD-03) y la copia optimizada (LOAD-07).
 * Nunca falla: lo que no se pueda calcular queda en null y la película se guarda igual.
 */
export async function processPoster(posterUrl: string | null, options?: FetchPosterOptions): Promise<ProcessedPoster> {
  if (!posterUrl) return { thumbhash: null, image: null }
  let bytes: Buffer
  try {
    bytes = await fetchPosterBytes(posterUrl, options)
  } catch (err) {
    console.warn('[POSTER] No se pudo descargar:', (err as Error).message)
    return { thumbhash: null, image: null }
  }
  const [thumbhash, image] = await Promise.all([
    thumbhashFromImage(bytes).catch((err) => (console.warn('[POSTER] Sin vista previa:', (err as Error).message), null)),
    optimizePoster(bytes).catch((err) => (console.warn('[POSTER] Sin copia optimizada:', (err as Error).message), null)),
  ])
  return { thumbhash, image }
}

/**
 * Sube la copia al bucket `posters` con la sesión del admin (RLS: solo admins) y devuelve su URL
 * pública. El nombre es el hash del contenido: el mismo póster no se duplica y la URL puede
 * cachearse un año. null si falla (se usará la URL original).
 */
export async function uploadPoster(supabase: SupabaseClient, image: Buffer): Promise<string | null> {
  const path = `${createHash('sha256').update(image).digest('hex').slice(0, 32)}.webp`
  const { error } = await supabase.storage
    .from(POSTERS_BUCKET)
    .upload(path, image, { contentType: 'image/webp', cacheControl: '31536000', upsert: true })
  if (error) {
    console.warn('[POSTER] No se pudo subir la copia:', error.message)
    return null
  }
  return supabase.storage.from(POSTERS_BUCKET).getPublicUrl(path).data.publicUrl
}
