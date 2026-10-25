import 'server-only'
import { moviePrefix, signPlaybackToken } from '@/workers/video/src/token'

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
