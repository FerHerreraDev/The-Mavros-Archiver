import { describe, it, expect } from 'vitest'
import { swapToken } from '@/lib/video/swap-token'

const LATEST = 'https://cdn.test/t/v1.200.bmV3.NEWSIG/movies/peli/master.m3u8'

describe('swapToken (WATCH-03)', () => {
  it('cambia el token de un segmento por el más reciente, conservando la ruta', () => {
    expect(swapToken('https://cdn.test/t/v1.100.b2xk.OLDSIG/movies/peli/720p/seg_00010.ts', LATEST)).toBe(
      'https://cdn.test/t/v1.200.bmV3.NEWSIG/movies/peli/720p/seg_00010.ts'
    )
  })

  it('conserva el query string', () => {
    expect(swapToken('https://cdn.test/t/OLD/movies/peli/720p/index.m3u8?x=1', LATEST)).toBe(
      'https://cdn.test/t/v1.200.bmV3.NEWSIG/movies/peli/720p/index.m3u8?x=1'
    )
  })

  it('con el mismo token no cambia nada', () => {
    const url = 'https://cdn.test/t/v1.200.bmV3.NEWSIG/movies/peli/480p/seg_00001.ts'
    expect(swapToken(url, LATEST)).toBe(url)
  })

  it.each([
    'https://otro.test/t/OLD/movies/peli/seg.ts', // otro origen
    'https://cdn.test/movies/peli/seg.ts', // sin /t/<token>/
    'no es url',
  ])('deja igual %j', (url) => {
    expect(swapToken(url, LATEST)).toBe(url)
  })

  it('si la URL más reciente no tiene token, no toca nada', () => {
    const url = 'https://cdn.test/t/OLD/movies/peli/seg.ts'
    expect(swapToken(url, 'https://cdn.test/movies/peli/master.m3u8')).toBe(url)
  })
})

// MOB-16: los mismos casos los usa Android (core:model PlaybackRulesTest)
import cases from '../fixtures/swap-token-cases.json'
describe('swapToken — casos compartidos con Android', () => {
  it.each(cases.cases)('$name', ({ url, expected }) => {
    expect(swapToken(url, cases.latest)).toBe(expected)
  })
  it('URL más reciente sin token', () => {
    const c = cases.latestWithoutToken
    expect(swapToken(c.url, c.latest)).toBe(c.expected)
  })
})
