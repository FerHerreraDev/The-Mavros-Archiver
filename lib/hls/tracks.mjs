// Pistas de audio y subtítulos del master HLS (VID-11, VID-12 de tests/SPEC.md).
// Lo usan scripts/hls-tracks.mjs (al codificar) y scripts/hls-verify.mjs.
// Funciones puras: sin red ni disco, para poder probarlas con fixtures.

export const AUDIO_GROUP = 'audio'
export const SUBTITLES_GROUP = 'subs'
export const MIN_SUBTITLE_CUES = 20

// ISO 639-2 (lo que traen mkv/mp4) y 639-1 → BCP-47 corto + nombre en español
const LANGUAGES = {
  es: ['spa', 'esp', 'Español'],
  en: ['eng', 'Inglés'],
  ja: ['jpn', 'Japonés'],
  fr: ['fre', 'fra', 'Francés'],
  de: ['ger', 'deu', 'Alemán'],
  it: ['ita', 'Italiano'],
  pt: ['por', 'Portugués'],
  ko: ['kor', 'Coreano'],
  zh: ['chi', 'zho', 'Chino'],
  ru: ['rus', 'Ruso'],
  hi: ['hin', 'Hindi'],
  ca: ['cat', 'Catalán'],
}

/** "spa" → { language: "es", name: "Español" }; desconocido → { language: código o "und", name: null } */
export function languageInfo(code) {
  const c = String(code ?? '').trim().toLowerCase()
  for (const [bcp, names] of Object.entries(LANGUAGES)) {
    if (c === bcp || names.slice(0, -1).includes(c)) return { language: bcp, name: names.at(-1) }
  }
  return { language: c && c !== 'und' ? c : 'und', name: null }
}

/**
 * Nombre legible de cada pista: el idioma en español; si dos comparten nombre se numeran
 * ("Español 1", "Español 2"); sin idioma conocido, "<fallback> N".
 * @param {(string | null | undefined)[]} codes
 * @param {string} fallback  "Audio" o "Subtítulos"
 */
export function trackNames(codes, fallback) {
  const base = codes.map((c, i) => languageInfo(c).name ?? `${fallback} ${i + 1}`)
  const count = {}
  base.forEach((n) => (count[n] = (count[n] ?? 0) + 1))
  const seen = {}
  return base.map((n) => (count[n] > 1 ? `${n} ${(seen[n] = (seen[n] ?? 0) + 1)}` : n))
}

// Líneas de anuncio que meten los grupos de descargas
const AD = /telegram|t\.me\/|https?:\/\/|www\.|\.(com|net|org|io)\b/i

/**
 * Limpia un WebVTT: quita las líneas de anuncios y antepone X-TIMESTAMP-MAP para que el
 * segundo 0 del subtítulo caiga en el primer PTS del video (MPEG-TS a 90 kHz).
 * @returns {{ vtt: string, cues: number }}
 */
export function cleanVtt(text, mpegts) {
  const blocks = text.replace(/\r\n?/g, '\n').replace(/^﻿/, '').split(/\n{2,}/)
  const cues = blocks.filter((b) => b.includes('-->') && !AD.test(b.slice(b.indexOf('-->'))))
  const header = `WEBVTT\nX-TIMESTAMP-MAP=MPEGTS:${mpegts},LOCAL:00:00:00.000`
  return { vtt: [header, ...cues.map((c) => c.trim())].join('\n\n') + '\n', cues: cues.length }
}

/** Playlist de subtítulos: un solo .vtt que cubre toda la película */
export function subtitlePlaylist(durationSeconds, vttUri) {
  const d = Math.max(0.001, durationSeconds)
  return [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    `#EXT-X-TARGETDURATION:${Math.ceil(d)}`,
    '#EXT-X-MEDIA-SEQUENCE:0',
    '#EXT-X-PLAYLIST-TYPE:VOD',
    `#EXTINF:${d.toFixed(3)},`,
    vttUri,
    '#EXT-X-ENDLIST',
    '',
  ].join('\n')
}

const quote = (s) => `"${String(s).replace(/"/g, "'")}"`

/**
 * Reescribe el master de ffmpeg: nombres e idiomas de las pistas de audio (VID-11) y
 * pistas de subtítulos citadas por cada calidad (VID-12).
 * @param {string} master
 * @param {{ audio?: { code?: string }[], subtitles?: { code?: string, uri: string }[] }} tracks
 *   audio en el mismo orden que en el master
 */
export function rewriteMaster(master, { audio = [], subtitles = [] }) {
  const audioNames = trackNames(audio.map((a) => a.code), 'Audio')
  const subNames = trackNames(subtitles.map((s) => s.code), 'Subtítulos')
  const lines = master.split(/\r?\n/)
  let a = 0
  const out = []
  let subsWritten = false
  const subtitleLines = subtitles.map((s, i) =>
    `#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="${SUBTITLES_GROUP}",NAME=${quote(subNames[i])},LANGUAGE="${languageInfo(s.code).language}",DEFAULT=NO,AUTOSELECT=YES,FORCED=NO,URI=${quote(s.uri)}`
  )
  for (const line of lines) {
    if (line.startsWith('#EXT-X-MEDIA:') && /TYPE=AUDIO/.test(line)) {
      const info = languageInfo(audio[a]?.code)
      const uri = line.match(/URI="([^"]*)"/)?.[1]
      const channels = line.match(/CHANNELS="([^"]*)"/)?.[1]
      out.push(
        `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="${AUDIO_GROUP}",NAME=${quote(audioNames[a] ?? `Audio ${a + 1}`)},LANGUAGE="${info.language}",DEFAULT=${a === 0 ? 'YES' : 'NO'},AUTOSELECT=YES` +
          (channels ? `,CHANNELS="${channels}"` : '') +
          `,URI="${uri}"`
      )
      a++
      continue
    }
    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      if (!subsWritten) {
        out.push(...subtitleLines)
        subsWritten = true
      }
      let inf = line.replace(/AUDIO="[^"]*"/, `AUDIO="${AUDIO_GROUP}"`)
      if (subtitles.length) inf += `,SUBTITLES="${SUBTITLES_GROUP}"`
      out.push(inf)
      continue
    }
    out.push(line)
  }
  return out.join('\n')
}

function attributes(line) {
  const attrs = {}
  for (const m of line.slice(line.indexOf(':') + 1).matchAll(/([A-Z0-9-]+)=("[^"]*"|[^,]*)/g)) attrs[m[1]] = m[2].replace(/^"|"$/g, '')
  return attrs
}

/**
 * Pistas alternativas del master (#EXT-X-MEDIA) y los grupos que cita cada calidad
 * @returns {{ renditions: { type: string, groupId: string, name: string, language: string | null, isDefault: boolean, uri: string | null }[], variantGroups: { audio: string | null, subtitles: string | null }[] }}
 */
export function parseRenditions(master) {
  const lines = master.split(/\r?\n/).map((l) => l.trim())
  const renditions = lines
    .filter((l) => l.startsWith('#EXT-X-MEDIA:'))
    .map((l) => {
      const a = attributes(l)
      return { type: a.TYPE, groupId: a['GROUP-ID'], name: a.NAME, language: a.LANGUAGE ?? null, isDefault: a.DEFAULT === 'YES', uri: a.URI ?? null }
    })
  const variantGroups = lines
    .filter((l) => l.startsWith('#EXT-X-STREAM-INF:'))
    .map((l) => {
      const a = attributes(l)
      return { audio: a.AUDIO ?? null, subtitles: a.SUBTITLES ?? null }
    })
  return { renditions, variantGroups }
}

/**
 * VID-11 / VID-12
 * @param {ReturnType<typeof parseRenditions>} parsed
 * @param {Record<string, { targetDuration: number, playlistType: string | null, endList: boolean, segments: { duration: number, uri: string }[] }>} medias  uri → playlist
 * @param {{ sourceDuration?: number, vtt?: Record<string, (string | undefined)[]> }} opts  vtt: uri de la pista → contenido de cada segmento
 * @returns {string[]}
 */
export function validateRenditions({ renditions, variantGroups }, medias, opts = {}) {
  const errors = []
  for (const [type, id, attr] of [['AUDIO', 'VID-11', 'audio'], ['SUBTITLES', 'VID-12', 'subtitles']]) {
    const group = renditions.filter((r) => r.type === type)
    if (!group.length) continue
    const groupIds = new Set(group.map((r) => r.groupId))
    if (groupIds.size !== 1) errors.push(`${id} las pistas ${type} no comparten GROUP-ID`)
    if (variantGroups.some((v) => !groupIds.has(v[attr]))) errors.push(`${id} hay calidades que no citan el grupo ${type}`)
    const defaults = group.filter((r) => r.isDefault).length
    if (type === 'AUDIO' && defaults !== 1) errors.push(`${id} se esperaba 1 pista de audio DEFAULT=YES, hay ${defaults}`)
    if (type === 'SUBTITLES' && defaults) errors.push(`${id} los subtítulos deben arrancar apagados (DEFAULT=NO)`)
    for (const r of group) {
      if (!r.name) errors.push(`${id} pista ${r.uri} sin NAME`)
      if (!r.language) errors.push(`${id} pista ${r.uri} sin LANGUAGE`)
      const media = r.uri && medias[r.uri]
      if (!media) {
        errors.push(`${id} no se pudo leer la playlist ${r.uri}`)
        continue
      }
      if (media.playlistType !== 'VOD' || !media.endList) errors.push(`${id} ${r.uri} no es VOD completa`)
      const total = media.segments.reduce((s, x) => s + x.duration, 0)
      if (opts.sourceDuration !== undefined && Math.abs(total - opts.sourceDuration) > 1) {
        errors.push(`${id} ${r.uri} dura ${total.toFixed(2)}s, el original ${opts.sourceDuration}s`)
      }
      if (media.segments.some((s) => s.duration > media.targetDuration + 0.5)) errors.push(`${id} ${r.uri} tiene segmentos que superan TARGETDURATION`)
      if (type === 'SUBTITLES' && opts.vtt) {
        for (const [i, s] of media.segments.entries()) {
          const text = opts.vtt[r.uri]?.[i]
          if (text === undefined) errors.push(`${id} no se pudo leer ${s.uri}`)
          else if (!text.startsWith('WEBVTT')) errors.push(`${id} ${s.uri} no empieza con WEBVTT`)
          else if (!/X-TIMESTAMP-MAP=MPEGTS:\d+,LOCAL:/.test(text)) errors.push(`${id} ${s.uri} sin X-TIMESTAMP-MAP`)
        }
      }
    }
  }
  return errors
}
