import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parseMaster, parseMedia, validateLadder } from '@/lib/hls/playlist.mjs'

const fixture = (name: string) => readFileSync(path.join(__dirname, '../fixtures/hls', name), 'utf8')

// Escalera de ejemplo "perfecta": 3 calidades, segmentos de 6 s, último de 3.5 s
function media(durations: number[], { vod = true, end = true, target = 6 } = {}) {
  return [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    `#EXT-X-TARGETDURATION:${target}`,
    ...(vod ? ['#EXT-X-PLAYLIST-TYPE:VOD'] : []),
    ...durations.flatMap((d, i) => [`#EXTINF:${d},`, `seg${i}.ts`]),
    ...(end ? ['#EXT-X-ENDLIST'] : []),
  ].join('\n')
}

const MASTER = [
  '#EXTM3U',
  '#EXT-X-STREAM-INF:BANDWIDTH=3200000,RESOLUTION=1920x800,CODECS="avc1.640028,mp4a.40.2"',
  '1080p/index.m3u8',
  '#EXT-X-STREAM-INF:BANDWIDTH=1700000,RESOLUTION=1280x534,CODECS="avc1.64001f,mp4a.40.2"',
  '720p/index.m3u8',
  '#EXT-X-STREAM-INF:BANDWIDTH=900000,RESOLUTION=854x356,CODECS="avc1.64001e,mp4a.40.2"',
  '480p/index.m3u8',
].join('\n')

const GOOD = [6.006, 6.006, 6.006, 3.5]
const goodMedias = () => ({
  '1080p/index.m3u8': parseMedia(media(GOOD)),
  '720p/index.m3u8': parseMedia(media(GOOD)),
  '480p/index.m3u8': parseMedia(media(GOOD)),
})
const source = { sourceDuration: 21.518, sourceResolution: { width: 1920, height: 800 } }

describe('parseMaster / parseMedia', () => {
  it('lee variantes con BANDWIDTH, RESOLUTION, CODECS y URI', () => {
    const variants = parseMaster(MASTER)
    expect(variants).toHaveLength(3)
    expect(variants[0]).toEqual({
      uri: '1080p/index.m3u8',
      bandwidth: 3200000,
      resolution: { width: 1920, height: 800 },
      codecs: 'avc1.640028,mp4a.40.2',
    })
  })

  it('lee segmentos, TARGETDURATION, tipo y ENDLIST', () => {
    const m = parseMedia(media(GOOD))
    expect(m.targetDuration).toBe(6)
    expect(m.playlistType).toBe('VOD')
    expect(m.endList).toBe(true)
    expect(m.segments.map((s) => s.duration)).toEqual(GOOD)
    expect(m.segments[0].uri).toBe('seg0.ts')
  })
})

describe('validateLadder', () => {
  it('una escalera correcta no tiene errores', () => {
    expect(validateLadder(parseMaster(MASTER), goodMedias(), source)).toEqual([])
  })

  it('VID-01 la playlist actual (sin master, 1 calidad) no cumple', () => {
    const legacy = parseMedia(fixture('legacy-irregular.m3u8'))
    const errors = validateLadder([{ uri: 'index.m3u8', bandwidth: NaN, resolution: null, codecs: null }], { 'index.m3u8': legacy })
    expect(errors.some((e) => e.startsWith('VID-01'))).toBe(true)
  })

  it('VID-03 la playlist actual tiene segmentos irregulares', () => {
    const legacy = parseMedia(fixture('legacy-irregular.m3u8'))
    const errors = validateLadder([{ uri: 'index.m3u8', bandwidth: 1, resolution: { width: 1920, height: 800 }, codecs: 'x' }], { 'index.m3u8': legacy })
    expect(errors.filter((e) => e.startsWith('VID-03')).length).toBeGreaterThan(100)
  })

  it('VID-01 menos de 3 calidades → error', () => {
    const two = parseMaster(MASTER).slice(0, 2)
    expect(validateLadder(two, goodMedias(), source).some((e) => e.startsWith('VID-01'))).toBe(true)
  })

  it('VID-01 falta CODECS → error', () => {
    const variants = parseMaster(MASTER.replace(',CODECS="avc1.64001f,mp4a.40.2"', ''))
    expect(validateLadder(variants, goodMedias(), source).some((e) => e.includes('sin CODECS'))).toBe(true)
  })

  it('VID-01 dos calidades con la misma playlist (original entre escalones) → error', () => {
    const variants = parseMaster(MASTER.replace('1080p/index.m3u8', '720p/index.m3u8'))
    expect(validateLadder(variants, goodMedias(), source)).toContain('VID-01 hay calidades que apuntan a la misma playlist')
  })

  it('VID-02 sin ENDLIST o sin VOD → error', () => {
    const medias = { ...goodMedias(), '720p/index.m3u8': parseMedia(media(GOOD, { end: false, vod: false })) }
    const errors = validateLadder(parseMaster(MASTER), medias, source)
    expect(errors.some((e) => e.includes('ENDLIST'))).toBe(true)
    expect(errors.some((e) => e.includes('VOD'))).toBe(true)
  })

  it('VID-03 un segmento intermedio de 7 s → error; el último puede ser corto', () => {
    const medias = { ...goodMedias(), '480p/index.m3u8': parseMedia(media([6.006, 7, 5.012, 3.5], { target: 7 })) }
    const errors = validateLadder(parseMaster(MASTER), medias, source)
    expect(errors.some((e) => e.startsWith('VID-03') && e.includes('segmento 1'))).toBe(true)
    expect(errors.some((e) => e.startsWith('VID-03') && e.includes('segmento 3'))).toBe(false)
  })

  it('VID-04 distinto número de segmentos → error', () => {
    const medias = { ...goodMedias(), '720p/index.m3u8': parseMedia(media([6.006, 6.006, 6.006, 3.5, 1])) }
    expect(validateLadder(parseMaster(MASTER), medias, source).some((e) => e.startsWith('VID-04'))).toBe(true)
  })

  it('VID-04 misma cantidad pero duraciones desalineadas → error', () => {
    const medias = { ...goodMedias(), '720p/index.m3u8': parseMedia(media([6.006, 5.9, 6.1, 3.5])) }
    expect(validateLadder(parseMaster(MASTER), medias, source).some((e) => e.startsWith('VID-04'))).toBe(true)
  })

  it('VID-05 duración total distinta del original → error', () => {
    const errors = validateLadder(parseMaster(MASTER), goodMedias(), { ...source, sourceDuration: 60 })
    expect(errors.some((e) => e.startsWith('VID-05'))).toBe(true)
  })

  it('VID-06 la calidad más alta por debajo del original, o una por encima → error', () => {
    const lower = validateLadder(parseMaster(MASTER), goodMedias(), { ...source, sourceResolution: { width: 3840, height: 1600 } })
    expect(lower.some((e) => e.startsWith('VID-06'))).toBe(true)

    const upscaled = validateLadder(parseMaster(MASTER), goodMedias(), { ...source, sourceResolution: { width: 1280, height: 534 } })
    expect(upscaled.some((e) => e.includes('supera al original'))).toBe(true)
  })
})
