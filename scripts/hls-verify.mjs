#!/usr/bin/env node
// Verifica una película HLS contra VID-01..VID-07 (tests/SPEC.md).
//
//   node scripts/hls-verify.mjs <carpeta local | URL del master.m3u8> [--source <video original>]
//
// Carpeta local: valida playlists (VID-01..06).
// URL: además pide cada playlist y segmento a R2 y revisa status, tipo y CORS (VID-07).
import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { parseMaster, parseMedia, validateLadder } from './hls/playlist.mjs'

const args = process.argv.slice(2)
const target = args[0]
const sourceFile = args.includes('--source') ? args[args.indexOf('--source') + 1] : null
if (!target) {
  console.error('Uso: node scripts/hls-verify.mjs <carpeta | URL master.m3u8> [--source <original>]')
  process.exit(2)
}

const isUrl = /^https?:\/\//.test(target)
const masterLocation = isUrl ? target : path.join(target, 'master.m3u8')
const resolve = (base, rel) => (isUrl ? new URL(rel, base).href : path.join(path.dirname(base), rel))
const read = async (loc) => (isUrl ? (await fetch(loc)).text() : readFile(loc, 'utf8'))

function probeSource(file) {
  const out = execFileSync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height:format=duration', '-of', 'json', file,
  ]).toString()
  const { streams, format } = JSON.parse(out)
  return {
    sourceDuration: Number(format.duration),
    sourceResolution: { width: streams[0].width, height: streams[0].height },
  }
}

const EXPECTED_TYPES = {
  '.m3u8': ['application/vnd.apple.mpegurl', 'application/x-mpegurl'],
  '.ts': ['video/mp2t'],
}

async function checkRemote(url) {
  const res = await fetch(url, { method: 'HEAD', headers: { Origin: 'http://localhost:3000' } })
  const ext = path.extname(new URL(url).pathname)
  const type = (res.headers.get('content-type') ?? '').split(';')[0].toLowerCase()
  const problems = []
  if (res.status !== 200) problems.push(`status ${res.status}`)
  if (!EXPECTED_TYPES[ext]?.includes(type)) problems.push(`tipo "${type}"`)
  if (!res.headers.get('access-control-allow-origin')) problems.push('sin CORS')
  return problems.length ? `VID-07 ${url}: ${problems.join(', ')}` : null
}

async function pool(items, size, fn) {
  const results = []
  let next = 0
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const i = next++
        results[i] = await fn(items[i])
      }
    })
  )
  return results
}

const variants = parseMaster(await read(masterLocation))
const medias = {}
const segmentLocations = []
for (const v of variants) {
  const loc = resolve(masterLocation, v.uri)
  try {
    medias[v.uri] = parseMedia(await read(loc))
    segmentLocations.push(loc, ...medias[v.uri].segments.map((s) => resolve(loc, s.uri)))
  } catch {
    // validateLadder reporta la playlist faltante
  }
}

const errors = validateLadder(variants, medias, sourceFile ? probeSource(sourceFile) : {})

if (isUrl) {
  const remote = await pool([masterLocation, ...segmentLocations], 24, checkRemote)
  errors.push(...remote.filter(Boolean))
}

const segments = Object.values(medias).reduce((n, m) => n + m.segments.length, 0)
console.log(`${variants.length} calidades: ${variants.map((v) => `${v.resolution?.width}x${v.resolution?.height} @ ${(v.bandwidth / 1e6).toFixed(2)} Mbps`).join(' | ')}`)
console.log(`${segments} segmentos${isUrl ? ' revisados en remoto' : ''}`)

if (errors.length) {
  console.error(`\n✗ ${errors.length} problema(s):`)
  errors.slice(0, 30).forEach((e) => console.error(`  - ${e}`))
  if (errors.length > 30) console.error(`  … y ${errors.length - 30} más`)
  process.exit(1)
}
console.log('\n✓ Cumple VID-01..' + (isUrl ? 'VID-07' : 'VID-06'))
