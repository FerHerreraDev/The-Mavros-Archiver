import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { adminClient } from '../helpers/users'
import { readLocalSupabase } from '../helpers/local-supabase'

// VID-09 de punta a punta con la Mac simulada: carpeta temporal, Supabase LOCAL y un directorio
// local como "R2" (rclone copia a rutas locales igual que a R2). Nunca toca producción.
const ROOT = path.resolve(__dirname, '../..')
let base: string
let fakeR2: string
let envFile: string
const tag = Math.random().toString(36).slice(2, 7)
const good = `Prueba Entrada ${tag} (1999).mp4`
const broken = `Rota ${tag} (2020).mp4`

function runInbox() {
  execFileSync('node', [path.join(ROOT, 'scripts/movie-inbox.mjs')], {
    cwd: ROOT,
    env: { ...process.env, MAVROS_INBOX: base, MAVROS_ENV_FILE: envFile, R2_REMOTE: fakeR2, PRESET: 'veryfast' },
    stdio: 'ignore',
  })
}
const old = (file: string) => utimesSync(file, new Date(Date.now() - 60_000), new Date(Date.now() - 60_000))

beforeAll(() => {
  base = mkdtempSync(path.join(tmpdir(), 'mavros-inbox-'))
  fakeR2 = path.join(base, 'r2')
  mkdirSync(path.join(base, 'Entrada'), { recursive: true })
  const local = readLocalSupabase()
  envFile = path.join(base, 'env')
  writeFileSync(envFile, `NEXT_PUBLIC_SUPABASE_URL=${local.url}\nSUPABASE_SERVICE_ROLE_KEY=${local.serviceRoleKey}\n`)

  const src = path.join(base, 'Entrada', good)
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=440',
    '-t', '8', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', src])
  writeFileSync(path.join(base, 'Entrada', broken), 'esto no es un video')
  writeFileSync(path.join(base, 'Entrada', 'notas.txt'), 'ignorar')
  for (const f of [good, broken]) old(path.join(base, 'Entrada', f))

  runInbox() // 1ª revisión: solo anota tamaños
  runInbox() // 2ª: ya no cambiaron → procesa
}, 600_000)

afterAll(async () => {
  await adminClient().from('movies').delete().like('slug', `prueba-entrada-${tag}%`)
  rmSync(base, { recursive: true, force: true })
})

describe('carpeta de entrada (VID-09)', () => {
  it('crea el borrador con título, año, slug y duración', async () => {
    const { data } = await adminClient().from('movies').select('*').eq('slug', `prueba-entrada-${tag}`).single()
    expect(data).toMatchObject({ title: `Prueba Entrada ${tag}`, release_year: 1999, status: 'draft', hls_path: `movies/prueba-entrada-${tag}/master.m3u8` })
    expect(Math.abs(data!.duration_seconds - 8)).toBeLessThanOrEqual(1)
  })

  it('sube el HLS a movies/<slug> y mueve el original a Procesadas', () => {
    expect(readFileSync(path.join(fakeR2, `movies/prueba-entrada-${tag}/master.m3u8`), 'utf8')).toContain('#EXTM3U')
    expect(existsSync(path.join(base, 'Procesadas', good))).toBe(true)
    expect(existsSync(path.join(base, 'Entrada', good))).toBe(false)
  })

  it('un archivo roto va a Errores con su .log y no crea nada', async () => {
    expect(existsSync(path.join(base, 'Errores', broken))).toBe(true)
    expect(readFileSync(path.join(base, 'Errores', `${broken}.log`), 'utf8')).toMatch(/falló/)
    const { data } = await adminClient().from('movies').select('id').like('slug', `rota-${tag}%`)
    expect(data).toEqual([])
  })

  it('ignora lo que no es video y no procesa dos veces', async () => {
    expect(existsSync(path.join(base, 'Entrada', 'notas.txt'))).toBe(true)
    runInbox()
    const { data } = await adminClient().from('movies').select('id').like('slug', `prueba-entrada-${tag}%`)
    expect(data).toHaveLength(1)
  })
})
