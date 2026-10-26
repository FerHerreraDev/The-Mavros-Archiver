import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// VID-08 con un video REAL: se codifica con scripts/encode-hls.sh y se mide cada segmento.
// Fuente exigente (ruido en movimiento) para que la calidad alta toque su tope.
const ROOT = path.resolve(__dirname, '../..')
const CAP: Record<string, number> = { '1080p': 6000, '720p': 3000, '480p': 1400, '360p': 800 }
let dir: string

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'mavros-vid08-'))
  const source = path.join(dir, 'source.mkv')
  execFileSync('ffmpeg', [
    '-hide_banner', '-nostdin', '-y', '-v', 'error',
    '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=24,noise=alls=40:allf=t+u',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
    '-t', '12', '-c:v', 'libx264', '-crf', '10', '-preset', 'ultrafast', '-c:a', 'aac', '-b:a', '128k', source,
  ])
  execFileSync(path.join(ROOT, 'scripts/encode-hls.sh'), [source, path.join(dir, 'out')], {
    env: { ...process.env, PRESET: 'veryfast' },
    stdio: 'ignore',
  })
}, 300_000)

afterAll(() => rmSync(dir, { recursive: true, force: true }))

/** kbps de VIDEO de cada segmento: suma de los paquetes de video (ffprobe) × 8 / duración declarada */
function segmentKbps(variant: string) {
  const playlist = readFileSync(path.join(dir, 'out', variant, 'index.m3u8'), 'utf8').split('\n')
  const out: number[] = []
  for (let i = 0; i < playlist.length; i++) {
    const m = playlist[i].match(/^#EXTINF:([\d.]+)/)
    if (!m) continue
    const segment = path.join(dir, 'out', variant, playlist[i + 1].trim())
    const sizes = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=size', '-of', 'csv=p=0', segment])
      .toString()
      .trim()
      .split('\n')
      .map((line) => parseInt(line, 10)) // ffprobe deja una coma al final: "3692,"
    out.push((sizes.reduce((a, b) => a + b, 0) * 8) / Number(m[1]) / 1000)
  }
  return out
}

describe('VID-08 calidad real al codificar', () => {
  it('genera 1080p, 720p, 480p y 360p', () => {
    const master = readFileSync(path.join(dir, 'out', 'master.m3u8'), 'utf8')
    for (const name of Object.keys(CAP)) expect(master).toContain(`${name}/index.m3u8`)
  })

  it.each(Object.keys(CAP))('%s: el video de ningún segmento supera su tope en más de 25 %%', (name) => {
    const kbps = segmentKbps(name)
    expect(kbps.length).toBeGreaterThan(0)
    expect(Math.max(...kbps), kbps.map((k) => k.toFixed(0)).join(', ')).toBeLessThanOrEqual(CAP[name] * 1.25)
  })

  it('1080p con contenido exigente usa más de 3.5 Mbps (ya no el tope viejo de 3)', () => {
    const kbps = segmentKbps('1080p')
    const avg = kbps.reduce((a, b) => a + b, 0) / kbps.length
    expect(avg).toBeGreaterThan(3500)
  })
})
