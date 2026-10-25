import { describe, it, expect } from 'vitest'
import { signPlaybackToken, verifyPlaybackToken, moviePrefix } from '@/workers/video/src/token'

const SECRET = 'unit-test-secret-0123456789abcdefghij'
const NOW = 1_800_000_000
const PREFIX = 'movies/chainsaw-man-reze-arc/'

const sign = (overrides: Partial<{ prefix: string; expiresAt: number; secret: string }> = {}) =>
  signPlaybackToken({ prefix: PREFIX, expiresAt: NOW + 3600, secret: SECRET, ...overrides })

describe('moviePrefix', () => {
  it('carpeta de la película a partir del hls_path', () => {
    expect(moviePrefix('movies/chainsaw-man-reze-arc/master.m3u8')).toBe('movies/chainsaw-man-reze-arc/')
  })
  it('PLY-02 un video en la raíz del bucket no tiene carpeta propia → error (el token valdría para todo)', () => {
    expect(() => moviePrefix('master.m3u8')).toThrow()
  })
})

describe('signPlaybackToken / verifyPlaybackToken', () => {
  it('PLY-01 un token recién firmado es válido y trae su carpeta y caducidad', async () => {
    expect(await verifyPlaybackToken(await sign(), SECRET, NOW)).toEqual({ ok: true, prefix: PREFIX, expiresAt: NOW + 3600 })
  })

  it('PLY-01 con otro secreto no es válido', async () => {
    const r = await verifyPlaybackToken(await sign(), 'another-secret-0123456789abcdefghijk', NOW)
    expect(r.ok).toBe(false)
  })

  it('PLY-01 alterar la carpeta invalida la firma (no se puede "ampliar" el acceso)', async () => {
    const [v, exp, , sig] = (await sign()).split('.')
    const otherFolder = Buffer.from('movies/').toString('base64url')
    expect((await verifyPlaybackToken([v, exp, otherFolder, sig].join('.'), SECRET, NOW)).ok).toBe(false)
  })

  it('PLY-01 alterar la caducidad invalida la firma', async () => {
    const [v, , prefix, sig] = (await sign()).split('.')
    expect((await verifyPlaybackToken([v, String(NOW + 999_999), prefix, sig].join('.'), SECRET, NOW)).ok).toBe(false)
  })

  it('PLY-01 alterar la firma (un carácter) la invalida', async () => {
    const token = await sign()
    const flipped = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A')
    expect((await verifyPlaybackToken(flipped, SECRET, NOW)).ok).toBe(false)
  })

  it('PLY-02 caducado → inválido (justo en el segundo de caducidad también)', async () => {
    const token = await sign({ expiresAt: NOW })
    expect(await verifyPlaybackToken(token, SECRET, NOW)).toEqual({ ok: false, reason: 'caducado' })
    expect((await verifyPlaybackToken(token, SECRET, NOW - 1)).ok).toBe(true)
  })

  it.each(['', 'v1', 'v1.1.2', 'v2.1800003600.bW92aWVzLw.sig', 'v1.abc.bW92aWVzLw.sig', 'v1.1800003600.%%%.sig', 'a.b.c.d.e'])(
    'basura %j → inválido sin lanzar error',
    async (token) => {
      expect((await verifyPlaybackToken(token, SECRET, NOW)).ok).toBe(false)
    }
  )

  it('no se puede firmar una carpeta sin "/" final ni con ".."', async () => {
    await expect(sign({ prefix: 'movies/peli' })).rejects.toThrow()
    await expect(sign({ prefix: 'movies/../' })).rejects.toThrow()
  })

  it('un secreto corto (<32) se rechaza al firmar y al verificar', async () => {
    await expect(sign({ secret: 'corto' })).rejects.toThrow()
    await expect(verifyPlaybackToken(await sign(), 'corto', NOW)).rejects.toThrow()
  })
})
