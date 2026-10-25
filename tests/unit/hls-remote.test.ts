import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { probeHlsMaster } from '@/lib/hls/remote'

const FIXTURES = path.join(__dirname, '../fixtures/hls')

/** fetch falso que sirve archivos de una carpeta como si fuera R2 */
function fakeR2(root: string, overrides: Record<string, string | number> = {}): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const { pathname } = new URL(String(input))
    if (pathname in overrides) {
      const o = overrides[pathname]
      return typeof o === 'number' ? new Response('', { status: o }) : new Response(o)
    }
    try {
      return new Response(readFileSync(path.join(root, pathname)))
    } catch {
      return new Response('', { status: 404 })
    }
  }) as typeof fetch
}

describe('probeHlsMaster (MOV-08)', () => {
  it('master válido → ok, duración redondeada y número de calidades', async () => {
    const r = await probeHlsMaster('https://cdn.test/', 'ladder/master.m3u8', fakeR2(FIXTURES))
    expect(r).toEqual({ ok: true, durationSeconds: 22, variants: 3 })
  })

  it('no existe → error que menciona la URL', async () => {
    const r = await probeHlsMaster('https://cdn.test', 'nope/master.m3u8', fakeR2(FIXTURES))
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toContain('https://cdn.test/nope/master.m3u8')
  })

  it('no es una playlist (#EXTM3U) → error', async () => {
    const r = await probeHlsMaster('https://cdn.test', 'x/master.m3u8', fakeR2(FIXTURES, { '/x/master.m3u8': '<html>hola</html>' }))
    expect(r.ok).toBe(false)
  })

  it('es una playlist de medios y no un master → error', async () => {
    const r = await probeHlsMaster('https://cdn.test', 'legacy-irregular.m3u8', fakeR2(FIXTURES))
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toMatch(/master/i)
  })

  it('la calidad no carga → error', async () => {
    const r = await probeHlsMaster('https://cdn.test', 'ladder/master.m3u8', fakeR2(FIXTURES, { '/ladder/1080p/index.m3u8': 500 }))
    expect(r.ok).toBe(false)
  })

  it('calidad sin ENDLIST → error (incompleta)', async () => {
    const incomplete = readFileSync(path.join(FIXTURES, 'ladder/1080p/index.m3u8'), 'utf8').replace('#EXT-X-ENDLIST', '')
    const r = await probeHlsMaster('https://cdn.test', 'ladder/master.m3u8', fakeR2(FIXTURES, { '/ladder/1080p/index.m3u8': incomplete }))
    expect(r.ok).toBe(false)
  })
})
