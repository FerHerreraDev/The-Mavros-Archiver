#!/usr/bin/env node
// Carpeta de entrada (VID-09): cada video que termine de copiarse en ~/Movies/Mavros/Entrada se
// convierte, verifica, sube a R2 y queda como borrador en el admin. Los episodios (S01E02, también
// dentro de carpetas con el nombre de la serie) quedan como borrador dentro de su serie (SER-14). Lo corre launchd cada 5 min
// (scripts/install-movie-inbox.sh) o a mano con `pnpm movie:inbox`.
//
// Solo lee de ../.env.local NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (para crear el
// borrador). Las llaves de R2 viven en la config de rclone.
// Pruebas: MAVROS_INBOX, MAVROS_ENV_FILE y R2_REMOTE apuntan a carpetas y Supabase locales.
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { parseMaster, parseMedia, mediaDuration } from '../lib/hls/playlist.mjs'
import { encodeFraction, episodeSlug, isStable, isVideo, parseEpisode, parseFileName, parseRcloneStats, remainingMs, statusFileName, uniqueSlug } from './movie-inbox-lib.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')
export const BASE = process.env.MAVROS_INBOX ?? path.join(homedir(), 'Movies', 'Mavros')
export const DIRS = { inbox: path.join(BASE, 'Entrada'), done: path.join(BASE, 'Procesadas'), failed: path.join(BASE, 'Errores') }
const STATE = path.join(BASE, '.estado.json')
export const LOCK = path.join(BASE, '.en-proceso')
export const PROGRESS = path.join(BASE, '.progreso.json')

const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`)

function notify(title, message) {
  try {
    execFileSync('osascript', ['-e', `display notification ${JSON.stringify(message)} with title ${JSON.stringify(title)}`])
  } catch {
    // sin notificaciones no pasa nada
  }
}

function supabaseAdmin() {
  const env = Object.fromEntries(
    readFileSync(process.env.MAVROS_ENV_FILE ?? path.join(ROOT, '.env.local'), 'utf8')
      .split('\n')
      .map((l) => l.match(/^\s*(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)\s*=\s*"?([^"\n]*)"?\s*$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2]]),
  )
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.local')
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
}

/** Corre un paso sin bloquear (para ir mostrando el avance); si falla, el error lleva sus últimas líneas */
function run(cmd, args, onLine = () => {}) {
  return new Promise((resolve, reject) => {
    // preset "medium": ~2× más rápido que "slow" con archivos apenas más pesados a la misma calidad (CRF)
    const env = { ...process.env, PRESET: process.env.PRESET ?? 'medium' }
    const child = spawn(cmd, args, { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] })
    const tail = []
    const collect = (chunk) => {
      for (const line of chunk.toString().split(/[\r\n]+/)) {
        if (!line.trim()) continue
        onLine(line)
        tail.push(line)
        if (tail.length > 25) tail.shift()
      }
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    child.on('error', reject)
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${path.basename(cmd)} falló:\n${tail.join('\n')}`))))
  })
}

/** Avance visible (VID-10): archivo en Entrada cuyo nombre es la barra + .progreso.json para la Terminal */
function progressReporter(title) {
  let current = null
  const update = (step, fraction, remaining) => {
    const name = statusFileName(title, step, fraction, remaining)
    if (name !== current) {
      if (current) rmSync(path.join(DIRS.inbox, current), { force: true })
      writeFileSync(path.join(DIRS.inbox, name), 'Avance de la película que se está procesando. Se borra solo al terminar.\n')
      current = name
    }
    writeFileSync(PROGRESS, JSON.stringify({ title, step, fraction, remainingMs: remaining, updatedAt: Date.now() }))
  }
  const clear = () => {
    if (current) rmSync(path.join(DIRS.inbox, current), { force: true })
    rmSync(PROGRESS, { force: true })
  }
  return { update, clear }
}

/** Segmentos de 6 s ya escritos (la calidad con más; todas van alineadas) */
function segmentsWritten(outDir) {
  if (!existsSync(outDir)) return 0
  return Math.max(0, ...readdirSync(outDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => readdirSync(path.join(outDir, d.name)).filter((f) => f.endsWith('.ts')).length))
}

export function sourceSeconds(file) {
  try {
    const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    return Number(out.trim()) || 0
  } catch (err) {
    throw new Error(`ffprobe falló: no se pudo leer el video (¿archivo dañado o incompleto?)\n${String(err.stderr ?? '').trim()}`)
  }
}

function durationSeconds(outDir) {
  const master = parseMaster(readFileSync(path.join(outDir, 'master.m3u8'), 'utf8'))
  const media = parseMedia(readFileSync(path.join(outDir, master[0].uri), 'utf8'))
  return Math.round(mediaDuration(media))
}

/** Videos de Entrada y sus subcarpetas, como rutas relativas ("Serie (2008)/S01E02.mkv") */
function listVideos(dir, prefix = '') {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    if (d.name.startsWith('.')) return []
    const rel = prefix ? `${prefix}/${d.name}` : d.name
    if (d.isDirectory()) return listVideos(path.join(dir, d.name), rel)
    return isVideo(d.name) ? [rel] : []
  })
}

/** Mueve a Procesadas/Errores conservando la carpeta (SER-14) */
function moveTo(dir, file) {
  const target = path.join(dir, file)
  mkdirSync(path.dirname(target), { recursive: true })
  renameSync(path.join(DIRS.inbox, file), target)
  return target
}

/** Qué se va a crear: película, o episodio con su serie (que se crea al final si no existe) */
async function plan(db, file) {
  const episode = parseEpisode(file)
  if (episode?.error) throw new Error(episode.error)

  if (!episode) {
    const { title, year, slug: wanted } = parseFileName(path.basename(file))
    if (!wanted) throw new Error('No se pudo sacar un slug del nombre del archivo')
    const { data: existing, error } = await db.from('movies').select('slug').like('slug', `${wanted}%`)
    if (error) throw new Error(`No se pudo leer la base: ${error.message}`)
    const slug = uniqueSlug(wanted, new Set(existing.map((m) => m.slug)))
    return { slug, title, label: title, r2: `movies/${slug}`, row: { title, release_year: year } }
  }

  const { series, season, episode: number, title } = episode
  if (!series.slug) throw new Error('No se pudo sacar un slug del nombre de la serie')
  const { data: found, error } = await db.from('series').select('id, slug, title').eq('slug', series.slug).maybeSingle()
  if (error) throw new Error(`No se pudo leer la base: ${error.message}`)
  if (found) {
    const { data: dup } = await db.from('movies').select('id').eq('series_id', found.id).eq('season_number', season).eq('episode_number', number)
    if (dup?.length) throw new Error(`Ese episodio ya existe: ${found.title} T${season}:E${number}. No se subió nada.`)
  }

  const wanted = episodeSlug(series.slug, season, number)
  const { data: existing } = await db.from('movies').select('slug').like('slug', `${wanted}%`)
  const slug = uniqueSlug(wanted, new Set((existing ?? []).map((m) => m.slug)))
  const label = `${found?.title ?? series.title} T${season}:E${number}`
  return {
    slug,
    title,
    label,
    r2: `series/${series.slug}/${wanted.slice(wanted.lastIndexOf('-') + 1)}`,
    row: { title, season_number: season, episode_number: number },
    series: found ?? { slug: series.slug, title: series.title, release_year: series.year },
  }
}

/** La serie existente o una nueva en borrador (SER-14) */
async function seriesId(db, series) {
  if (series.id) return series.id
  const { data, error } = await db.from('series').insert({ ...series, status: 'draft' }).select('id').single()
  if (error) throw new Error(`Se subió el video pero no se pudo crear la serie: ${error.message}`)
  return data.id
}

async function processFile(db, file) {
  const source = path.join(DIRS.inbox, file)
  const target = await plan(db, file)
  const { slug } = target
  const work = mkdtempSync(path.join(tmpdir(), 'mavros-'))
  const out = path.join(work, slug)
  const progress = progressReporter(target.label)
  try {
    log(`${file}: convirtiendo → ${slug}`)
    const total = sourceSeconds(source)
    const started = Date.now()
    progress.update('convirtiendo', 0, null)
    const ticker = setInterval(() => {
      const fraction = encodeFraction(segmentsWritten(out), total)
      progress.update('convirtiendo', fraction, remainingMs(fraction, Date.now() - started))
    }, 10_000)
    try {
      await run(path.join(ROOT, 'scripts/encode-hls.sh'), [source, out])
    } finally {
      clearInterval(ticker)
    }

    log(`${file}: verificando`)
    progress.update('verificando', 1, null)
    await run('node', [path.join(ROOT, 'scripts/hls-verify.mjs'), out, '--source', source])

    log(`${file}: subiendo a R2 ${target.r2}`)
    const upStarted = Date.now()
    let lastShown = 0
    progress.update('subiendo', 0, null)
    await run(path.join(ROOT, 'scripts/r2-upload.sh'), [out, target.r2], (line) => {
      const stats = parseRcloneStats(line)
      if (!stats || Date.now() - lastShown < 10_000) return
      lastShown = Date.now()
      progress.update('subiendo', stats.fraction, remainingMs(stats.fraction, Date.now() - upStarted))
    })

    const { error: insertError } = await db.from('movies').insert({
      ...target.row,
      ...(target.series ? { series_id: await seriesId(db, target.series) } : {}),
      slug,
      duration_seconds: durationSeconds(out),
      hls_path: `${target.r2}/master.m3u8`,
      genres: [],
      status: 'draft',
    })
    if (insertError) throw new Error(`Se subió el video pero no se pudo crear el borrador: ${insertError.message}`)
    return { slug, label: target.label, isEpisode: Boolean(target.series) }
  } finally {
    progress.clear()
    rmSync(work, { recursive: true, force: true })
  }
}

async function main() {
  for (const dir of Object.values(DIRS)) mkdirSync(dir, { recursive: true })

  // Una sola corrida a la vez (convertir puede tardar más que el intervalo de launchd)
  if (existsSync(LOCK)) {
    const pid = Number(readFileSync(LOCK, 'utf8'))
    try {
      process.kill(pid, 0)
      return log(`Ya hay una conversión en curso (pid ${pid})`)
    } catch {
      // el proceso anterior ya no existe: el candado quedó huérfano
    }
  }
  writeFileSync(LOCK, String(process.pid))

  try {
    const previous = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {}
    const seen = {}
    const ready = []
    for (const file of listVideos(DIRS.inbox)) {
      const st = statSync(path.join(DIRS.inbox, file))
      seen[file] = { size: st.size }
      if (isStable(previous[file], { size: st.size, mtimeMs: st.mtimeMs }, Date.now())) ready.push(file)
    }
    writeFileSync(STATE, JSON.stringify(seen))
    if (ready.length === 0) return

    const db = supabaseAdmin()
    for (const file of ready) {
      try {
        const { slug, label, isEpisode } = await processFile(db, file)
        moveTo(DIRS.done, file)
        log(`${file}: listo como borrador (${slug})`)
        notify(
          isEpisode ? 'Mavros: episodio listo' : 'Mavros: película lista',
          isEpisode ? `"${label}" quedó como borrador. Publícalo desde su serie.` : `"${label}" quedó como borrador. Agrega póster y publícala.`
        )
      } catch (err) {
        const failed = moveTo(DIRS.failed, file)
        writeFileSync(`${failed}.log`, `${new Date().toISOString()}\n${err.message}\n`)
        log(`${file}: ERROR ${err.message.split('\n')[0]}`)
        notify('Mavros: falló una película', `${file}: revisa Errores/${file}.log`)
      }
    }
  } finally {
    rmSync(LOCK, { force: true })
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
