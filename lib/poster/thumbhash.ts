import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchPosterBytes, type FetchPosterOptions } from './fetch-poster'
import { POSTER_MAX_WIDTH, optimizeImage, processImageBytes, uploadImage } from './image.mjs'

export { POSTER_MAX_WIDTH, POSTERS_BUCKET, BACKDROP_MAX_WIDTH, thumbhashFromImage } from './image.mjs'

/** Copia optimizada (LOAD-07): WebP, máx. 600 px de ancho (o [maxWidth]), sin agrandar, sin metadatos */
export async function optimizePoster(bytes: Buffer, maxWidth = POSTER_MAX_WIDTH): Promise<Buffer> {
  return optimizeImage(bytes, maxWidth)
}

export type ProcessedPoster = { thumbhash: string | null; image: Buffer | null }

/**
 * Descarga el póster UNA vez y saca la vista previa (LOAD-03) y la copia optimizada (LOAD-07).
 * Nunca falla: lo que no se pueda calcular queda en null y la película se guarda igual.
 */
export async function processPoster(posterUrl: string | null, options?: FetchPosterOptions, maxWidth = POSTER_MAX_WIDTH): Promise<ProcessedPoster> {
  if (!posterUrl) return { thumbhash: null, image: null }
  let bytes: Buffer
  try {
    bytes = await fetchPosterBytes(posterUrl, options)
  } catch (err) {
    console.warn('[POSTER] No se pudo descargar:', (err as Error).message)
    return { thumbhash: null, image: null }
  }
  return processImageBytes(bytes, maxWidth)
}

/**
 * Sube la copia al bucket `posters` con la sesión del admin (RLS: solo admins) y devuelve su URL
 * pública. El nombre es el hash del contenido: el mismo póster no se duplica y la URL puede
 * cachearse un año. null si falla (se usará la URL original).
 */
export async function uploadPoster(supabase: SupabaseClient, image: Buffer): Promise<string | null> {
  return uploadImage(supabase, image)
}
