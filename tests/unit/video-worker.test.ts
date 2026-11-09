import { describe, it, expect, beforeEach } from 'vitest'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { handleRequest } from '@/workers/video/src/handler'
import { signPlaybackToken, signPurgeToken } from '@/workers/video/src/token'
import { fsBucket } from '../helpers/fs-bucket'

// Carpeta que simula el bucket: <fixtures>/hls con dos "películas"
const ROOT = path.join(__dirname, '../fixtures/hls')
const SECRET = 'worker-test-secret-0123456789abcdefgh'
const NOW = 1_800_000_000
const CDN = 'https://video.test'

let reads: string[]
let env: Parameters<typeof handleRequest>[1]

beforeEach(() => {
  reads = []
  env = { VIDEOS: fsBucket(ROOT, reads), VIDEO_TOKEN_SECRET: SECRET }
})

const token = (prefix = 'ladder/', expiresAt = NOW + 3600, secret = SECRET) =>
  signPlaybackToken({ prefix, expiresAt, secret })

const get = (url: string, init?: RequestInit) => handleRequest(new Request(url, init), env, NOW)

describe('PLY-03 sin token válido → 403 y no se lee R2', () => {
  it.each([
    ['sin token', async () => `${CDN}/ladder/master.m3u8`],
    ['token basura', async () => `${CDN}/t/basura/ladder/master.m3u8`],
    ['token caducado', async () => `${CDN}/t/${await token('ladder/', NOW - 1)}/ladder/master.m3u8`],
    ['token de otro secreto', async () => `${CDN}/t/${await token('ladder/', NOW + 60, 'otro-secreto-0123456789abcdefghijklm')}/ladder/master.m3u8`],
    ['token de otra película', async () => `${CDN}/t/${await token('otra-peli/')}/ladder/master.m3u8`],
    ['raíz', async () => `${CDN}/`],
  ])('%s', async (_label, url) => {
    const res = await get(await url())
    expect(res.status).toBe(403)
    expect(reads).toEqual([])
  })
})

describe('PLY-04 con token válido', () => {
  it('master.m3u8 con tipo, CORS y cache', async () => {
    const res = await get(`${CDN}/t/${await token()}/ladder/master.m3u8`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/vnd.apple.mpegurl')
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(await res.text()).toBe(readFileSync(path.join(ROOT, 'ladder/master.m3u8'), 'utf8'))
  })

  it('Range → 206 con Content-Range y solo esos bytes', async () => {
    const res = await get(`${CDN}/t/${await token()}/ladder/master.m3u8`, { headers: { Range: 'bytes=0-6' } })
    const size = readFileSync(path.join(ROOT, 'ladder/master.m3u8')).length
    expect(res.status).toBe(206)
    expect(res.headers.get('content-range')).toBe(`bytes 0-6/${size}`)
    expect(await res.text()).toBe('#EXTM3U')
  })

  it('HEAD sin cuerpo y con Content-Length', async () => {
    const res = await get(`${CDN}/t/${await token()}/ladder/master.m3u8`, { method: 'HEAD' })
    expect(res.status).toBe(200)
    expect(Number(res.headers.get('content-length'))).toBeGreaterThan(0)
    expect(await res.text()).toBe('')
  })

  it('preflight CORS permite Range', async () => {
    const res = await get(`${CDN}/t/x/ladder/master.m3u8`, { method: 'OPTIONS' })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-headers')).toMatch(/range/i)
  })

  it('subtítulos .vtt con su tipo y CORS (VID-12)', async () => {
    const res = await get(`${CDN}/t/${await token()}/ladder/sub-0/index.vtt`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/vtt; charset=utf-8')
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect((await res.text()).startsWith('WEBVTT')).toBe(true)
  })

  it('archivo que no existe → 404', async () => {
    expect((await get(`${CDN}/t/${await token()}/ladder/no-existe.m3u8`)).status).toBe(404)
  })

  it.each([
    'ladder/../legacy-irregular.m3u8',
    'ladder/%2e%2e/legacy-irregular.m3u8',
    'ladder//master.m3u8',
    'ladder/secreto.txt',
    'ladder/video.mp4',
    'ladder\\..\\legacy-irregular.m3u8',
  ])('ruta peligrosa o tipo no permitido %j → 403, sin leer R2', async (key) => {
    const res = await get(`${CDN}/t/${await token()}/${key}`)
    expect(res.status).toBe(403)
    expect(reads).toEqual([])
  })

  it('".." en cualquier forma nunca lee fuera de la carpeta del token', async () => {
    for (const key of ['ladder/../legacy-irregular.m3u8', 'ladder/%2e%2e/legacy-irregular.m3u8', 'ladder/%2E%2E/legacy-irregular.m3u8', 'ladder/..%2flegacy-irregular.m3u8']) {
      await get(`${CDN}/t/${await token()}/${key}`)
    }
    expect(reads.every((k) => k.startsWith('ladder/'))).toBe(true)
  })

  it('métodos de escritura → 405', async () => {
    expect((await get(`${CDN}/t/${await token()}/ladder/master.m3u8`, { method: 'PUT', body: 'x' })).status).toBe(405)
  })
})

describe('PLY-05 las URIs relativas de las playlists heredan el token', () => {
  it('del master a una calidad, resolviendo como un reproductor', async () => {
    const masterUrl = `${CDN}/t/${await token()}/ladder/master.m3u8`
    const master = await (await get(masterUrl)).text()
    const variantUri = master.split('\n').find((l) => l && !l.startsWith('#'))!

    const variantUrl = new URL(variantUri, masterUrl).href
    const res = await get(variantUrl)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('#EXT-X-ENDLIST')
  })
})

describe('PLY-10 borrar la carpeta de una película', () => {
  // Bucket en memoria: aquí sí se borra de verdad
  function memoryBucket(keys: string[]) {
    const store = new Set(keys)
    const bucket = {
      ...env.VIDEOS,
      async list({ prefix, limit = 1000 }: { prefix: string; limit?: number }) {
        const all = [...store].filter((k) => k.startsWith(prefix)).sort()
        return { objects: all.slice(0, limit).map((key) => ({ key })), truncated: all.length > limit }
      },
      async delete(toDelete: string[]) {
        toDelete.forEach((k) => store.delete(k))
      },
    }
    return { store, bucket }
  }

  const purgeToken = (prefix = 'movies/peli/', expiresAt = NOW + 120, secret = SECRET) =>
    signPurgeToken({ prefix, expiresAt, secret })
  const purge = (path: string, method = 'POST') => handleRequest(new Request(`${CDN}${path}`, { method }), env, NOW)

  it('borra todo lo de esa carpeta y nada de otras (ni de "peli-2/")', async () => {
    const { store, bucket } = memoryBucket([
      'movies/peli/master.m3u8', 'movies/peli/720p/seg_00000.ts', 'movies/peli/sub-0/index.vtt',
      'movies/peli-2/master.m3u8', 'movies/otra/master.m3u8',
    ])
    env.VIDEOS = bucket
    const res = await purge(`/purge/${await purgeToken()}`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ deleted: 3, done: true })
    expect([...store].sort()).toEqual(['movies/otra/master.m3u8', 'movies/peli-2/master.m3u8'])
  })

  it('carpetas grandes se borran por tandas: done: false hasta terminar', async () => {
    const { store, bucket } = memoryBucket(Array.from({ length: 5500 }, (_, i) => `movies/peli/720p/seg_${String(i).padStart(5, '0')}.ts`))
    env.VIDEOS = bucket
    const first = await (await purge(`/purge/${await purgeToken()}`)).json()
    expect(first).toEqual({ deleted: 5000, done: false })
    const second = await (await purge(`/purge/${await purgeToken()}`)).json()
    expect(second).toEqual({ deleted: 500, done: true })
    expect(store.size).toBe(0)
  })

  it.each([
    ['token de reproducción', async () => `/purge/${await token('movies/peli/')}`],
    ['token de borrado caducado', async () => `/purge/${await purgeToken('movies/peli/', NOW - 1)}`],
    ['token de borrado de otro secreto', async () => `/purge/${await purgeToken('movies/peli/', NOW + 60, 'otro-secreto-0123456789abcdefghijklm')}`],
    ['carpeta de un solo nivel ("movies/")', async () => `/purge/${await purgeToken('movies/')}`],
    ['token basura', async () => '/purge/basura'],
  ])('%s → 403 y no borra nada', async (_label, path) => {
    const { store, bucket } = memoryBucket(['movies/peli/master.m3u8', 'movies/otra/master.m3u8'])
    env.VIDEOS = bucket
    expect((await purge(await path())).status).toBe(403)
    expect(store.size).toBe(2)
  })

  it('con GET → 405; y un token de borrado no sirve para reproducir', async () => {
    const { store, bucket } = memoryBucket(['movies/peli/master.m3u8'])
    env.VIDEOS = bucket
    const t = await purgeToken()
    expect((await purge(`/purge/${t}`, 'GET')).status).toBe(405)
    expect((await purge(`/t/${t}/movies/peli/master.m3u8`, 'GET')).status).toBe(403)
    expect(store.size).toBe(1)
  })
})
