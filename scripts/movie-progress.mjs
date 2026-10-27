#!/usr/bin/env node
// Avance en vivo de la carpeta de entrada (VID-10): `pnpm movie:progreso` (Ctrl+C para salir).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { BASE, DIRS, LOCK, PROGRESS, sourceSeconds } from './movie-inbox.mjs'
import { bar, encodeFraction, formatRemaining, isVideo, remainingMs } from './movie-inbox-lib.mjs'

/** Si la conversión la arrancó una versión anterior (sin .progreso.json), se estima por los segmentos */
function estimateFromWorkDir() {
  const video = readdirSync(DIRS.inbox).find(isVideo)
  const work = readdirSync(tmpdir()).filter((d) => d.startsWith('mavros-')).map((d) => path.join(tmpdir(), d))
    .filter((d) => statSync(d).isDirectory()).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]
  if (!video || !work) return null
  const out = path.join(work, readdirSync(work)[0] ?? '')
  if (!existsSync(out)) return null
  const segs = Math.max(0, ...readdirSync(out, { withFileTypes: true }).filter((d) => d.isDirectory())
    .map((d) => readdirSync(path.join(out, d.name)).filter((f) => f.endsWith('.ts')).length))
  const fraction = encodeFraction(segs, sourceSeconds(path.join(DIRS.inbox, video)))
  return { title: video.replace(/\.[^.]+$/, ''), step: 'convirtiendo', fraction, remainingMs: remainingMs(fraction, Date.now() - statSync(work).birthtimeMs) }
}

function show() {
  let p = existsSync(PROGRESS) ? JSON.parse(readFileSync(PROGRESS, 'utf8')) : null
  if (!p && existsSync(LOCK)) p = estimateFromWorkDir()
  const line = p
    ? `${p.title} — ${p.step} ${bar(p.fraction, 20)} ${Math.round(p.fraction * 100)}% · faltan ${formatRemaining(p.remainingMs)}`
    : `Nada en proceso. Deja una película en ${path.join(BASE, 'Entrada')}`
  process.stdout.write(`\r\x1b[2K${line}`)
}

show()
setInterval(show, 5_000)
