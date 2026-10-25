import { describe, it, expect, beforeEach } from 'vitest'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { handleRequest } from '@/workers/video/src/handler'
import { signPlaybackToken } from '@/workers/video/src/token'
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
