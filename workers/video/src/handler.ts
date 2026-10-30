// Worker de video (PLY-03..PLY-05 de tests/SPEC.md).
//   GET /t/<token>/<ruta en el bucket>
// El token va en la ruta: las URIs relativas de las playlists lo heredan solas.
import { verifyPlaybackToken } from './token.ts'

// Subconjunto de la API de R2 que usamos (así se prueba con un bucket falso)
export type BucketRange = { offset: number; length?: number } | { suffix: number }
export interface VideoObject {
  body: ReadableStream | null
  size: number
  httpEtag: string
  range?: { offset?: number; length?: number }
}
export interface VideoBucket {
  get(key: string, options?: { range?: BucketRange }): Promise<VideoObject | null>
}
export interface Env {
  VIDEOS: VideoBucket
  VIDEO_TOKEN_SECRET: string
}

const TYPES: Record<string, { contentType: string; cacheControl: string }> = {
  '.m3u8': { contentType: 'application/vnd.apple.mpegurl', cacheControl: 'private, max-age=60' },
  '.ts': { contentType: 'video/mp2t', cacheControl: 'private, max-age=31536000, immutable' },
  '.vtt': { contentType: 'text/vtt; charset=utf-8', cacheControl: 'private, max-age=31536000, immutable' },
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, ETag',
  'Access-Control-Max-Age': '86400',
}

const deny = (status: number) => new Response(null, { status, headers: CORS })

function parseRange(header: string | null): BucketRange | undefined {
  const m = header?.match(/^bytes=(\d*)-(\d*)$/)
  if (!m || (m[1] === '' && m[2] === '')) return undefined
  if (m[1] === '') return { suffix: Number(m[2]) }
  const offset = Number(m[1])
  return m[2] === '' ? { offset } : { offset, length: Number(m[2]) - offset + 1 }
}

export async function handleRequest(request: Request, env: Env, nowSeconds = Date.now() / 1000): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (request.method !== 'GET' && request.method !== 'HEAD') return deny(405)

  const match = new URL(request.url).pathname.match(/^\/t\/([^/]+)\/(.+)$/)
  if (!match) return deny(403)

  let key: string
  try {
    key = decodeURIComponent(match[2])
  } catch {
    return deny(403)
  }
  const ext = key.slice(key.lastIndexOf('.'))
  if (!TYPES[ext] || key.startsWith('/') || key.includes('\\') || key.split('/').some((s) => s === '..' || s === '.' || s === '')) {
    return deny(403)
  }

  const check = await verifyPlaybackToken(match[1], env.VIDEO_TOKEN_SECRET, nowSeconds)
  if (!check.ok || !key.startsWith(check.prefix)) return deny(403)

  const range = parseRange(request.headers.get('Range'))
  const object = await env.VIDEOS.get(key, range ? { range } : undefined)
  if (!object) return deny(404)

  const headers = new Headers({
    ...CORS,
    'Content-Type': TYPES[ext].contentType,
    'Cache-Control': TYPES[ext].cacheControl,
    'Accept-Ranges': 'bytes',
    ETag: object.httpEtag,
  })

  let status = 200
  if (range && object.range) {
    const start = object.range.offset ?? 0
    const length = object.range.length ?? object.size - start
    headers.set('Content-Range', `bytes ${start}-${start + length - 1}/${object.size}`)
    headers.set('Content-Length', String(length))
    status = 206
  } else {
    headers.set('Content-Length', String(object.size))
  }

  return new Response(request.method === 'HEAD' ? null : object.body, { status, headers })
}
