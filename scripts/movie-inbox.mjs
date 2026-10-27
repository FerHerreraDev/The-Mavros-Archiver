#!/usr/bin/env node
// Carpeta de entrada (VID-09): cada video que termine de copiarse en ~/Movies/Mavros/Entrada se
// convierte, verifica, sube a R2 y queda como borrador en el admin. Lo corre launchd cada 5 min
// (scripts/install-movie-inbox.sh) o a mano con `pnpm movie:inbox`.
//
// Solo lee de ../.env.local NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (para crear el
// borrador). Las llaves de R2 viven en la config de rclone.
// Pruebas: MAVROS_INBOX, MAVROS_ENV_FILE y R2_REMOTE apuntan a carpetas y Supabase locales.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { parseMaster, parseMedia, mediaDuration } from '../lib/hls/playlist.mjs'
import { isStable, isVideo, parseFileName, uniqueSlug } from './movie-inbox-lib.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')
const BASE = process.env.MAVROS_INBOX ?? path.join(homedir(), 'Movies', 'Mavros')
const DIRS = { inbox: path.join(BASE, 'Entrada'), done: path.join(BASE, 'Procesadas'), failed: path.join(BASE, 'Errores') }
const STATE = path.join(BASE, '.estado.json')
const LOCK = path.join(BASE, '.en-proceso')

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

/** Corre un paso; si falla, el error lleva las últimas líneas de su salida */
function run(cmd, args) {
  try {
    return execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 })
  } catch (err) {
    const out = `${err.stdout ?? ''}\n${err.stderr ?? ''}`.trim().split('\n').slice(-25).join('\n')
    throw new Error(`${path.basename(cmd)} falló:\n${out}`)
  }
}

function durationSeconds(outDir) {
  const master = parseMaster(readFileSync(path.join(outDir, 'master.m3u8'), 'utf8'))
  const media = parseMedia(readFileSync(path.join(outDir, master[0].uri), 'utf8'))
  return Math.round(mediaDuration(media))
}

async function processFile(db, file) {
  const source = path.join(DIRS.inbox, file)
  const { title, year, slug: wanted } = parseFileName(file)
  if (!wanted) throw new Error('No se pudo sacar un slug del nombre del archivo')

  const { data: existing, error } = await db.from('movies').select('slug').like('slug', `${wanted}%`)
  if (error) throw new Error(`No se pudo leer la base: ${error.message}`)
  const slug = uniqueSlug(wanted, new Set(existing.map((m) => m.slug)))
  const work = mkdtempSync(path.join(tmpdir(), 'mavros-'))
  const out = path.join(work, slug)
  try {
    log(`${file}: convirtiendo → ${slug}`)
    run(path.join(ROOT, 'scripts/encode-hls.sh'), [source, out])
    log(`${file}: verificando`)
    run('node', [path.join(ROOT, 'scripts/hls-verify.mjs'), out, '--source', source])
    log(`${file}: subiendo a R2 movies/${slug}`)
    run(path.join(ROOT, 'scripts/r2-upload.sh'), [out, `movies/${slug}`])

    const { error: insertError } = await db.from('movies').insert({
      slug,
      title,
      release_year: year,
      duration_seconds: durationSeconds(out),
      hls_path: `movies/${slug}/master.m3u8`,
      genres: [],
      status: 'draft',
    })
    if (insertError) throw new Error(`Se subió el video pero no se pudo crear el borrador: ${insertError.message}`)
    return { slug, title }
  } finally {
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
    for (const file of readdirSync(DIRS.inbox).filter(isVideo)) {
      const st = statSync(path.join(DIRS.inbox, file))
      seen[file] = { size: st.size }
      if (isStable(previous[file], { size: st.size, mtimeMs: st.mtimeMs }, Date.now())) ready.push(file)
    }
    writeFileSync(STATE, JSON.stringify(seen))
    if (ready.length === 0) return

    const db = supabaseAdmin()
    for (const file of ready) {
      try {
        const { slug, title } = await processFile(db, file)
        renameSync(path.join(DIRS.inbox, file), path.join(DIRS.done, file))
        log(`${file}: listo como borrador (${slug})`)
        notify('Mavros: película lista', `"${title}" quedó como borrador. Agrega póster y publícala.`)
      } catch (err) {
        renameSync(path.join(DIRS.inbox, file), path.join(DIRS.failed, file))
        writeFileSync(path.join(DIRS.failed, `${file}.log`), `${new Date().toISOString()}\n${err.message}\n`)
        log(`${file}: ERROR ${err.message.split('\n')[0]}`)
        notify('Mavros: falló una película', `${file}: revisa Errores/${file}.log`)
      }
    }
  } finally {
    rmSync(LOCK, { force: true })
  }
}

await main()
