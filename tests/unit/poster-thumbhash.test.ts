import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { thumbHashToApproximateAspectRatio, thumbHashToRGBA } from 'thumbhash'
import { computePosterThumbhash, thumbhashFromImage } from '@/lib/poster/thumbhash'
import { thumbhashDataUrl } from '@/lib/poster/placeholder'
import type { Lookup } from '@/lib/poster/fetch-poster'

// Póster 200×300: mitad de arriba roja (220,30,30), mitad de abajo azul (30,40,200)
const fixture = (name: string) => readFileSync(path.join(__dirname, '../fixtures/posters', name))
const lookup: Lookup = async () => [{ address: '151.101.1.140' }]
const bytes = (b64: string) => Uint8Array.from(Buffer.from(b64, 'base64'))
// Mismo formato que exige la columna poster_thumbhash (migración 0008)
const DB_FORMAT = /^[A-Za-z0-9+/]+={0,2}$/

function pixel(hash: string, fx: number, fy: number) {
  const { w, h, rgba } = thumbHashToRGBA(bytes(hash))
  const i = (Math.floor(fy * h) * w + Math.floor(fx * w)) * 4
  return { r: rgba[i], g: rgba[i + 1], b: rgba[i + 2] }
}

describe('thumbhashFromImage (LOAD-03)', () => {
  it.each(['red-blue-2x3.png', 'red-blue-2x3.jpg'])('%s → hash corto con los colores y la proporción reales', async (name) => {
    const hash = await thumbhashFromImage(fixture(name))
    expect(hash).toMatch(DB_FORMAT)
    expect(hash.length).toBeGreaterThanOrEqual(8)
    expect(hash.length).toBeLessThanOrEqual(64)

    expect(thumbHashToApproximateAspectRatio(bytes(hash))).toBeCloseTo(2 / 3, 1)
    const top = pixel(hash, 0.5, 0.1)
    const bottom = pixel(hash, 0.5, 0.9)
    expect(top.r, 'arriba es rojo').toBeGreaterThan(top.b + 60)
    expect(bottom.b, 'abajo es azul').toBeGreaterThan(bottom.r + 60)
  })

  it('bytes que no son una imagen → error', async () => {
    await expect(thumbhashFromImage(Buffer.from('esto no es una imagen'))).rejects.toThrow()
  })
})

describe('computePosterThumbhash (LOAD-03)', () => {
  it('sin póster → null y no descarga nada', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    expect(await computePosterThumbhash(null, { fetchImpl, lookup })).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('póster descargable → el mismo hash que la imagen', async () => {
    const png = fixture('red-blue-2x3.png')
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png' } }))
    expect(await computePosterThumbhash('https://cdn.example.com/p.png', { fetchImpl, lookup })).toBe(await thumbhashFromImage(png))
  })

  it('póster que no se puede descargar → null, sin lanzar', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      throw new Error('ECONNRESET')
    })
    await expect(computePosterThumbhash('https://cdn.example.com/p.png', { fetchImpl, lookup })).resolves.toBeNull()
  })

  it('póster en la red interna → null, sin lanzar', async () => {
    await expect(computePosterThumbhash('https://127.0.0.1/p.png', { fetchImpl: vi.fn<typeof fetch>(), lookup })).resolves.toBeNull()
  })

  it('"imagen" corrupta → null, sin lanzar', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('basura', { headers: { 'content-type': 'image/png' } }))
    await expect(computePosterThumbhash('https://cdn.example.com/p.png', { fetchImpl, lookup })).resolves.toBeNull()
  })
})

describe('thumbhashDataUrl (LOAD-02)', () => {
  it('hash válido → PNG en data URL', async () => {
    const url = thumbhashDataUrl(await thumbhashFromImage(fixture('red-blue-2x3.png')))
    expect(url).toMatch(/^data:image\/png;base64,/)
  })

  it.each([null, undefined, '', '%%%', 'AA=='])('%s → null (se queda el color de tarjeta)', (hash) => {
    expect(thumbhashDataUrl(hash)).toBeNull()
  })
})
