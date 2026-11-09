import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseRenditions } from '@/lib/hls/tracks.mjs'

// VID-11 / VID-12 / VID-13 con un video REAL: dos audios (español en AC-3, inglés en AAC), subtítulos
// en español con un anuncio y una pista de subtítulos casi vacía. Se codifica con scripts/encode-hls.sh.
const ROOT = path.resolve(__dirname, '../..')
let dir: string
let out: string
let source: string

// Una línea cada 0.4 s: caben todas en los 12 s del video
const time = (ms: number) => `00:00:${String(Math.floor(ms / 1000)).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`
const srt = (cues: string[]) => cues.map((text, i) => `${i + 1}\n${time(i * 400)} --> ${time(i * 400 + 300)}\n${text}\n`).join('\n')

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'mavros-vid11-'))
  out = path.join(dir, 'out')
  source = path.join(dir, 'source.mkv')
  const full = path.join(dir, 'full.srt')
  const junk = path.join(dir, 'junk.srt')
  writeFileSync(full, srt(['Únete a Telegram @grupo', ...Array.from({ length: 11 }, (_, i) => `Línea ${i + 1}`), ...Array.from({ length: 11 }, (_, i) => `Otra ${i + 1}`)]))
  writeFileSync(junk, srt(['Únete a Telegram']))
  execFileSync('ffmpeg', [
    '-hide_banner', '-nostdin', '-y', '-v', 'error',
    '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=24',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
    '-f', 'lavfi', '-i', 'sine=frequency=660:sample_rate=48000',
    '-i', full, '-i', junk,
    '-map', '0', '-map', '1', '-map', '2', '-map', '3', '-map', '4',
    '-t', '12', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a:0', 'ac3', '-ac:a:0', '6', '-c:a:1', 'aac', '-c:s', 'srt',
    '-metadata:s:a:0', 'language=spa', '-metadata:s:a:1', 'language=eng',
    '-metadata:s:s:0', 'language=spa', '-metadata:s:s:1', 'language=spa',
    source,
  ])
  execFileSync(path.join(ROOT, 'scripts/encode-hls.sh'), [source, out], { env: { ...process.env, PRESET: 'ultrafast' }, stdio: 'ignore' })
}, 300_000)

afterAll(() => rmSync(dir, { recursive: true, force: true }))

const audioOf = (file: string) =>
  execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name,channels', '-of', 'csv=p=0', file]).toString().trim().split('\n')[0]
const masterCodecs = (master: string) => [...readFileSync(master, 'utf8').matchAll(/CODECS="([^"]+)"/g)].flatMap((m) => m[1].split(','))

describe('VID-11 / VID-12 al codificar', () => {
  it('dos idiomas de audio como pistas aparte y una de subtítulos apagada', () => {
    const { renditions, variantGroups } = parseRenditions(readFileSync(path.join(out, 'master.m3u8'), 'utf8'))
    expect(renditions.map((r) => [r.type, r.name, r.language, r.isDefault])).toEqual([
      ['AUDIO', 'Español', 'es', true],
      ['AUDIO', 'Inglés', 'en', false],
      ['SUBTITLES', 'Español', 'es', false],
    ])
    expect(variantGroups.length).toBe(3)
    expect(variantGroups.every((g) => g.audio === 'audio' && g.subtitles === 'subs')).toBe(true)
  })

  it('las calidades son solo video (el audio va en su pista)', () => {
    const seg = path.join(out, '720p', 'seg_00000.ts')
    const streams = (type: string) => execFileSync('ffprobe', ['-v', 'error', '-select_streams', type, '-show_entries', 'stream=index', '-of', 'csv=p=0', seg]).toString().trim()
    expect(streams('v')).not.toBe('')
    expect(streams('a')).toBe('')
    expect(existsSync(path.join(out, 'audio-1', 'seg_00000.ts'))).toBe(true)
  })

  it('VID-13 el audio AC-3 sale como AAC estéreo y el AAC se copia; el master solo cita H.264 y AAC', () => {
    expect(audioOf(path.join(out, 'audio-0', 'seg_00000.ts'))).toBe('aac,2')
    expect(audioOf(path.join(out, 'audio-1', 'seg_00000.ts'))).toBe('aac,1')
    const codecs = masterCodecs(path.join(out, 'master.m3u8'))
    expect(codecs.length).toBeGreaterThan(0)
    expect(codecs.every((c) => /^(avc1|mp4a)\./.test(c))).toBe(true)
  })

  it('el .vtt no trae el anuncio y está alineado con el video', () => {
    const vtt = readFileSync(path.join(out, 'sub-0', 'index.vtt'), 'utf8')
    expect(vtt).toMatch(/^WEBVTT\nX-TIMESTAMP-MAP=MPEGTS:\d+,LOCAL:00:00:00\.000\n/)
    expect(vtt).toContain('Línea 1')
    expect(vtt).not.toContain('Telegram')
    expect(existsSync(path.join(out, 'sub-1'))).toBe(false)
  })

  it('hls:verify lo da por bueno contra el original', () => {
    const res = execFileSync('node', [path.join(ROOT, 'scripts/hls-verify.mjs'), out, '--source', source]).toString()
    expect(res).toContain('✓ Cumple VID-01..VID-06, VID-11 y VID-12')
    expect(res).toContain('Audio: Español, Inglés')
  })
})

describe('VID-13 con una sola pista de audio en E-AC-3', () => {
  let single: string
  let singleOut: string

  beforeAll(() => {
    single = mkdtempSync(path.join(tmpdir(), 'mavros-vid13-'))
    singleOut = path.join(single, 'out')
    const src = path.join(single, 'source.mp4')
    execFileSync('ffmpeg', [
      '-hide_banner', '-nostdin', '-y', '-v', 'error',
      '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=24',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
      '-t', '8', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'eac3', '-ac', '6', src,
    ])
    execFileSync(path.join(ROOT, 'scripts/encode-hls.sh'), [src, singleOut], { env: { ...process.env, PRESET: 'ultrafast' }, stdio: 'ignore' })
  }, 300_000)

  afterAll(() => rmSync(single, { recursive: true, force: true }))

  it('cada calidad lleva el audio en AAC estéreo y el master solo cita H.264 y AAC', () => {
    for (const q of ['720p', '480p', '360p']) expect(audioOf(path.join(singleOut, q, 'seg_00000.ts'))).toBe('aac,2')
    expect(masterCodecs(path.join(singleOut, 'master.m3u8')).every((c) => /^(avc1|mp4a)\./.test(c))).toBe(true)
  })
})
