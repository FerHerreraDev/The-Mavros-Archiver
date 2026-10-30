import { describe, it, expect } from 'vitest'
import { ladder, label } from '../../scripts/hls-ladder.mjs'

type Rung = { width: number; name: string; crf: number; maxrateKbps: number }

// VID-08: tope de bitrate por resolución (kbps)
const CAP: Record<string, number> = { '2160p': 16000, '1440p': 9000, '1080p': 6000, '720p': 3000, '480p': 1400, '360p': 800 }

describe('escalera de calidades (VID-06, VID-08)', () => {
  it('original 1080p → 1080p, 720p, 480p y 360p con el tope de cada una', () => {
    const rungs: Rung[] = ladder(1920)
    expect(rungs.map((r) => [r.width, r.name, r.maxrateKbps])).toEqual([
      [1920, '1080p', 6000],
      [1280, '720p', 3000],
      [854, '480p', 1400],
      [640, '360p', 800],
    ])
  })

  it('original 4K → la 4K con SU tope (no el de 1080p) y además 1080p debajo', () => {
    const rungs: Rung[] = ladder(3840)
    expect(rungs[0]).toMatchObject({ width: 3840, name: '2160p', maxrateKbps: 16000 })
    expect(rungs.map((r) => r.name)).toEqual(['2160p', '1080p', '720p', '480p', '360p'])
  })

  it('un original de 720p no se agranda: 720p, 480p y 360p', () => {
    expect(ladder(1280).map((r: Rung) => r.name)).toEqual(['720p', '480p', '360p'])
  })

  it.each([3840, 2560, 1920, 1440, 1280, 1000, 854, 700])('original de %i px: ninguna calidad supera al original y los topes bajan', (w) => {
    const rungs: Rung[] = ladder(w)
    expect(rungs[0].width).toBe(w)
    for (const r of rungs) {
      expect(r.width).toBeLessThanOrEqual(w)
      expect(r.maxrateKbps).toBe(CAP[label(r.width)])
    }
    for (let i = 1; i < rungs.length; i++) {
      expect(rungs[i].width).toBeLessThan(rungs[i - 1].width)
      expect(rungs[i].maxrateKbps).toBeLessThanOrEqual(rungs[i - 1].maxrateKbps)
    }
  })

  it.each([3840, 2560, 1920, 1782, 1440, 1280, 1000, 854, 700])('VID-01 original de %i px: cada calidad en su propia carpeta', (w) => {
    const names = ladder(w).map((r: Rung) => r.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('VID-01 un original entre escalones (1782 de ancho) va en "original", no en otra "720p"', () => {
    expect(ladder(1782).map((r: Rung) => [r.width, r.name])).toEqual([
      [1782, 'original'],
      [1280, '720p'],
      [854, '480p'],
      [640, '360p'],
    ])
  })

  it('el nombre va por ancho (1920×800 en 2.39:1 sigue siendo 1080p)', () => {
    expect(label(1920)).toBe('1080p')
    expect(label(3840)).toBe('2160p')
    expect(label(1279)).toBe('480p')
  })
})
