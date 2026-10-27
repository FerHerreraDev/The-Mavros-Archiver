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
// SER-14: un episodio dentro de la carpeta de su serie y otro con la serie en el nombre
const showName = `Serie Entrada ${tag}`
const showSlug = `serie-entrada-${tag}`
const inFolder = `${showName} (2010)/S01E01 - Piloto.mp4`
const named = `${showName} - S01E02.mp4`

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
  mkdirSync(path.join(base, 'Entrada', `${showName} (2010)`))
  for (const f of [inFolder, named]) {
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=440',
      '-t', '4', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', path.join(base, 'Entrada', f)])
    old(path.join(base, 'Entrada', f))
  }
  writeFileSync(path.join(base, 'Entrada', broken), 'esto no es un video')
  writeFileSync(path.join(base, 'Entrada', 'notas.txt'), 'ignorar')
  for (const f of [good, broken]) old(path.join(base, 'Entrada', f))

  runInbox() // 1ª revisión: solo anota tamaños
  runInbox() // 2ª: ya no cambiaron → procesa
}, 600_000)

afterAll(async () => {
  await adminClient().from('movies').delete().like('slug', `prueba-entrada-${tag}%`)
  await adminClient().from('series').delete().eq('slug', showSlug)
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

describe('episodios en la carpeta de entrada (SER-14)', () => {
  it('crea la serie en borrador (título y año de la carpeta) una sola vez', async () => {
    const { data } = await adminClient().from('series').select('*').eq('slug', showSlug)
    expect(data).toHaveLength(1)
    expect(data![0]).toMatchObject({ title: showName, release_year: 2010, status: 'draft' })
  })

  it('cada episodio queda en borrador dentro de su serie, con slug, título y video en series/<serie>/s01e0N', async () => {
    const { data: show } = await adminClient().from('series').select('id').eq('slug', showSlug).single()
    const { data } = await adminClient()
      .from('movies')
      .select('slug, title, status, season_number, episode_number, hls_path, duration_seconds')
      .eq('series_id', show!.id)
      .order('episode_number')
    expect(data).toMatchObject([
      { slug: `${showSlug}-s01e01`, title: 'Piloto', status: 'draft', season_number: 1, episode_number: 1, hls_path: `series/${showSlug}/s01e01/master.m3u8` },
      { slug: `${showSlug}-s01e02`, title: 'Episodio 2', status: 'draft', season_number: 1, episode_number: 2, hls_path: `series/${showSlug}/s01e02/master.m3u8` },
    ])
    expect(Math.abs(data![0].duration_seconds - 4)).toBeLessThanOrEqual(1)
    expect(readFileSync(path.join(fakeR2, `series/${showSlug}/s01e02/master.m3u8`), 'utf8')).toContain('#EXTM3U')
  })

  it('el original pasa a Procesadas dentro de su misma carpeta', () => {
    expect(existsSync(path.join(base, 'Procesadas', inFolder))).toBe(true)
    expect(existsSync(path.join(base, 'Procesadas', named))).toBe(true)
    expect(existsSync(path.join(base, 'Entrada', inFolder))).toBe(false)
  })

  it('un episodio que ya existe va a Errores explicando por qué, sin subir nada', async () => {
    const again = `${showName} - S01E01 - Repetido.mp4`
    const file = path.join(base, 'Entrada', again)
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=24', '-f', 'lavfi', '-i', 'sine', '-t', '2', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', file])
    old(file)
    rmSync(path.join(fakeR2, `series/${showSlug}/s01e01`), { recursive: true })
    runInbox()
    runInbox()
    expect(existsSync(path.join(base, 'Errores', again))).toBe(true)
    expect(readFileSync(path.join(base, 'Errores', `${again}.log`), 'utf8')).toMatch(/ya existe/)
    expect(existsSync(path.join(fakeR2, `series/${showSlug}/s01e01`))).toBe(false)
    const { data } = await adminClient().from('movies').select('id').like('slug', `${showSlug}%`)
    expect(data).toHaveLength(2)
  }, 120_000)
})

// TMDB-04: otra carpeta, con un TMDB falso. La de arriba corre sin clave (todo sigue como antes).
import { startFakeTmdb, tmdbFixtures } from '../helpers/fake-tmdb'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

describe('datos automáticos con TMDB (TMDB-04)', () => {
  const SHOW = 5000 + Math.floor(Math.random() * 1000)
  const MOVIE = 7000 + Math.floor(Math.random() * 1000)
  let tbase: string
  let tmdb: Awaited<ReturnType<typeof startFakeTmdb>>
  const showName = `Serie TMDB Entrada ${tag}`
  const showSlug = `serie-tmdb-entrada-${tag}`
  const movieFile = `Peli TMDB ${tag} (1988).mp4`

  // Asíncrono: el TMDB falso vive en este proceso y tiene que poder responder mientras corre
  const runWithTmdb = () =>
    promisify(execFile)('node', [path.join(ROOT, 'scripts/movie-inbox.mjs')], {
      cwd: ROOT,
      env: {
        ...process.env,
        MAVROS_INBOX: tbase,
        MAVROS_ENV_FILE: envFile,
        R2_REMOTE: path.join(tbase, 'r2'),
        PRESET: 'veryfast',
        TMDB_API_KEY: 'clave-de-prueba',
        TMDB_API_URL: tmdb.url,
        TMDB_IMAGE_URL: 'https://image.invalid/t/p',
      },
    })

  beforeAll(async () => {
    tmdb = await startFakeTmdb(tmdbFixtures(SHOW, MOVIE))
    tbase = mkdtempSync(path.join(tmpdir(), 'mavros-inbox-tmdb-'))
    mkdirSync(path.join(tbase, 'Entrada', `${showName} (2008)`), { recursive: true })
    for (const f of [`${showName} (2008)/S01E02.mp4`, `${showName} (2008)/S01E03.mp4`, movieFile]) {
      const file = path.join(tbase, 'Entrada', f)
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=24', '-f', 'lavfi', '-i', 'sine', '-t', '3', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', file])
      old(file)
    }
    await runWithTmdb()
    await runWithTmdb()
  }, 600_000)

  afterAll(async () => {
    await adminClient().from('series').delete().eq('slug', showSlug)
    await adminClient().from('movies').delete().like('slug', `peli-tmdb-${tag}%`)
    rmSync(tbase, { recursive: true, force: true })
    await tmdb.close()
  })

  it('la serie nueva se crea con los datos de TMDB (título y año del archivo)', async () => {
    const { data } = await adminClient().from('series').select('*').eq('slug', showSlug).single()
    expect(data).toMatchObject({
      title: showName,
      release_year: 2008,
      tmdb_id: SHOW,
      synopsis: 'Sinopsis de la serie.',
      genres: ['drama', 'crimen'],
      poster_url: 'https://image.invalid/t/p/w780/sp.jpg',
      backdrop_url: 'https://image.invalid/t/p/w1280/sb.jpg',
    })
  })

  it('el episodio toma título (en inglés si no hay español), sinopsis e imagen de TMDB', async () => {
    const { data } = await adminClient().from('movies').select('title, synopsis, poster_url').eq('slug', `${showSlug}-s01e02`).single()
    expect(data).toEqual({ title: 'The Cat', synopsis: 'Second one.', poster_url: 'https://image.invalid/t/p/w780/e2.jpg' })
  })

  it('sin imagen en TMDB, la imagen del episodio es un cuadro del video', async () => {
    const { data } = await adminClient().from('movies').select('title, poster_url, poster_image_url, poster_thumbhash').eq('slug', `${showSlug}-s01e03`).single()
    expect(data!.title).toBe('Episodio 3')
    expect(data!.poster_url).toBeNull()
    expect(data!.poster_image_url).toMatch(/\/posters\/[0-9a-f]{32}\.webp$/)
    expect(data!.poster_thumbhash).toBeTruthy()
    const res = await fetch(data!.poster_image_url!)
    expect(res.headers.get('content-type')).toBe('image/webp')
  })

  it('la película se completa sin cambiar su título', async () => {
    const { data } = await adminClient().from('movies').select('title, release_year, synopsis, genres, tmdb_id, poster_url').eq('slug', `peli-tmdb-${tag}`).single()
    expect(data).toEqual({
      title: `Peli TMDB ${tag}`,
      release_year: 1988,
      synopsis: 'Neo-Tokio, 2019.',
      genres: ['animación', 'ciencia ficción'],
      tmdb_id: MOVIE,
      poster_url: 'https://image.invalid/t/p/w780/mp.jpg',
    })
  })

  it('los tres pasaron a Procesadas', () => {
    expect(existsSync(path.join(tbase, 'Procesadas', `${showName} (2008)`, 'S01E02.mp4'))).toBe(true)
    expect(existsSync(path.join(tbase, 'Procesadas', `${showName} (2008)`, 'S01E03.mp4'))).toBe(true)
    expect(existsSync(path.join(tbase, 'Procesadas', movieFile))).toBe(true)
  })
})
