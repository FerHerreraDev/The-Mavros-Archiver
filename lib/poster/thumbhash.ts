import 'server-only'
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

/**
 * Vista previa del póster para guardar con la película (LOAD-03).
 * Nunca falla: sin póster o si no se puede leer devuelve null y la película se guarda igual.
 */
export async function computePosterThumbhash(posterUrl: string | null, options?: FetchPosterOptions): Promise<string | null> {
  if (!posterUrl) return null
  try {
    return await thumbhashFromImage(await fetchPosterBytes(posterUrl, options))
  } catch (err) {
    console.warn('[POSTER] Sin vista previa:', (err as Error).message)
    return null
  }
}
