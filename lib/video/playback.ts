import 'server-only'
import { isPurgeablePrefix, moviePrefix, signPlaybackToken, signPurgeToken } from '@/workers/video/src/token'

export const PLAYBACK_TTL_SECONDS = 4 * 60 * 60

function config() {
  const cdn = process.env.VIDEO_CDN_URL?.replace(/\/+$/, '')
  const secret = process.env.VIDEO_TOKEN_SECRET
  if (!cdn || !secret) throw new Error('Faltan VIDEO_CDN_URL o VIDEO_TOKEN_SECRET en la configuración del servidor')
  return { cdn, secret }
}

/**
 * Base firmada para la carpeta de una película: `<cdn>/t/<token>`.
 * Se le concatena el hls_path (o cualquier archivo de esa carpeta).
 */
export async function signedVideoBase(hlsPath: string, ttlSeconds = PLAYBACK_TTL_SECONDS) {
  const { cdn, secret } = config()
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds
  const token = await signPlaybackToken({ prefix: moviePrefix(hlsPath), expiresAt, secret })
  return { base: `${cdn}/t/${token}`, expiresAt }
}

/** URL firmada del master.m3u8 de una película (PLY-08) */
export async function playbackUrl(hlsPath: string, ttlSeconds = PLAYBACK_TTL_SECONDS) {
  const { base, expiresAt } = await signedVideoBase(hlsPath, ttlSeconds)
  return { url: `${base}/${hlsPath}`, expiresAt: new Date(expiresAt * 1000).toISOString() }
}

const PURGE_TTL_SECONDS = 120
const PURGE_MAX_CALLS = 100

/**
 * Borra en R2, a través del Worker, todos los archivos de la carpeta de una película (PLY-10).
 * Devuelve cuántos archivos se borraron; lanza si el Worker falla a medias (se puede reintentar).
 */
export async function purgeVideoFolder(hlsPath: string): Promise<number> {
  const { cdn, secret } = config()
  const prefix = moviePrefix(hlsPath)
  if (!isPurgeablePrefix(prefix)) throw new Error(`La carpeta "${prefix}" no se puede borrar entera`)
  let deleted = 0
  for (let i = 0; i < PURGE_MAX_CALLS; i++) {
    const token = await signPurgeToken({ prefix, expiresAt: Math.floor(Date.now() / 1000) + PURGE_TTL_SECONDS, secret })
    const res = await fetch(`${cdn}/purge/${token}`, { method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(30_000) })
    if (!res.ok) throw new Error(`El Worker de video respondió ${res.status} al borrar ${prefix}`)
    const body = (await res.json()) as { deleted: number; done: boolean }
    deleted += body.deleted
    if (body.done) return deleted
  }
  throw new Error(`No se terminó de borrar ${prefix} (${deleted} archivos borrados)`)
}
