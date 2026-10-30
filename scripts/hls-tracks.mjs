#!/usr/bin/env node
// Después de encode-hls.sh: nombres e idiomas de las pistas de audio (VID-11) y subtítulos
// de texto del original como pistas WebVTT apagadas por defecto (VID-12).
//
//   node scripts/hls-tracks.mjs <video original> <carpeta HLS> [segundos]
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseMaster, parseMedia, mediaDuration } from '../lib/hls/playlist.mjs'
import { cleanVtt, MIN_SUBTITLE_CUES, parseRenditions, rewriteMaster, subtitlePlaylist } from '../lib/hls/tracks.mjs'

const [source, out, limit] = process.argv.slice(2)
if (!source || !out) {
  console.error('Uso: node scripts/hls-tracks.mjs <original> <carpeta HLS> [segundos]')
  process.exit(2)
}

// Subtítulos de imagen (PGS, VobSub, DVB) no se pueden pasar a texto
const TEXT_SUBTITLES = new Set(['subrip', 'srt', 'ass', 'ssa', 'mov_text', 'webvtt', 'text'])

const probe = JSON.parse(
  execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name:stream_tags=language', '-of', 'json', source]).toString()
)
const streams = probe.streams ?? []
const audio = streams.filter((s) => s.codec_type === 'audio').map((s) => ({ code: s.tags?.language }))
const subtitleStreams = streams.filter((s) => s.codec_type === 'subtitle')

const masterPath = path.join(out, 'master.m3u8')
const master = readFileSync(masterPath, 'utf8')
const variants = parseMaster(master)
const firstMedia = parseMedia(readFileSync(path.join(out, variants[0].uri), 'utf8'))
const duration = mediaDuration(firstMedia)

/** Primer PTS (90 kHz) del contenido: el menor de la primera calidad y la primera pista de audio */
function firstPts() {
  const audioUri = parseRenditions(master).renditions.find((r) => r.type === 'AUDIO')?.uri
  const firsts = [variants[0].uri, audioUri].filter(Boolean).map((uri) => {
    const media = parseMedia(readFileSync(path.join(out, uri), 'utf8'))
    const seg = path.join(out, path.dirname(uri), media.segments[0].uri)
    return execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=start_pts', '-of', 'csv=p=0', seg])
      .toString()
      .split('\n')
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0)
  })
  return Math.min(...firsts.flat())
}

const subtitles = []
if (subtitleStreams.length) {
  const mpegts = firstPts()
  subtitleStreams.forEach((s, k) => {
    const code = s.tags?.language
    if (!TEXT_SUBTITLES.has(s.codec_name)) return console.log(`Subtítulos ${k} (${s.codec_name}): son imagen, se omiten`)
    let raw
    try {
      raw = execFileSync('ffmpeg', ['-v', 'error', '-nostdin', '-i', source, ...(limit ? ['-t', limit] : []), '-map', `0:s:${k}`, '-f', 'webvtt', '-'], { maxBuffer: 64 * 1024 * 1024 }).toString()
    } catch (err) {
      return console.log(`Subtítulos ${k}: no se pudieron leer (${String(err.stderr ?? err.message).trim().split('\n')[0]})`)
    }
    const { vtt, cues } = cleanVtt(raw, mpegts)
    if (cues < MIN_SUBTITLE_CUES) return console.log(`Subtítulos ${k} (${code ?? 'sin idioma'}): ${cues} líneas, se omiten`)
    const dir = `sub-${subtitles.length}`
    mkdirSync(path.join(out, dir), { recursive: true })
    writeFileSync(path.join(out, dir, 'index.vtt'), vtt)
    writeFileSync(path.join(out, dir, 'index.m3u8'), subtitlePlaylist(duration, 'index.vtt'))
    subtitles.push({ code, uri: `${dir}/index.m3u8` })
    console.log(`Subtítulos ${k} (${code ?? 'sin idioma'}): ${cues} líneas → ${dir}`)
  })
}

const hasAudioGroup = parseRenditions(master).renditions.some((r) => r.type === 'AUDIO')
if (hasAudioGroup || subtitles.length) {
  writeFileSync(masterPath, rewriteMaster(master, { audio: hasAudioGroup ? audio : [], subtitles }))
}
console.log(`Pistas: ${hasAudioGroup ? audio.length : 1} de audio, ${subtitles.length} de subtítulos`)
