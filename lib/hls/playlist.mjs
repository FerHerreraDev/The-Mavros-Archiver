// Parser y validador de playlists HLS (VID-01 a VID-06 de tests/SPEC.md).
// Lo usan scripts/hls-verify.mjs y la app (verificar el video al crear una película).
// Funciones puras: sin red ni disco, para poder probarlas con fixtures.

/** @param {string} line */
function attributes(line) {
  const attrs = {}
  const body = line.slice(line.indexOf(':') + 1)
  for (const match of body.matchAll(/([A-Z0-9-]+)=("[^"]*"|[^,]*)/g)) {
    attrs[match[1]] = match[2].replace(/^"|"$/g, '')
  }
  return attrs
}

/**
 * @param {string} text
 * @returns {{ uri: string, bandwidth: number, resolution: { width: number, height: number } | null, codecs: string | null }[]}
 */
export function parseMaster(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim())
  const variants = []
  lines.forEach((line, i) => {
    if (!line.startsWith('#EXT-X-STREAM-INF:')) return
    const a = attributes(line)
    const res = a.RESOLUTION?.match(/^(\d+)x(\d+)$/)
    variants.push({
      uri: lines.slice(i + 1).find((l) => l && !l.startsWith('#')) ?? '',
      bandwidth: Number(a.BANDWIDTH ?? NaN),
      resolution: res ? { width: Number(res[1]), height: Number(res[2]) } : null,
      codecs: a.CODECS ?? null,
    })
  })
  return variants
}

/**
 * @param {string} text
 * @returns {{ targetDuration: number, playlistType: string | null, endList: boolean, segments: { duration: number, uri: string }[] }}
 */
export function parseMedia(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim())
  const segments = []
  let targetDuration = NaN
  let playlistType = null
  let endList = false
  lines.forEach((line, i) => {
    if (line.startsWith('#EXT-X-TARGETDURATION:')) targetDuration = Number(line.split(':')[1])
    else if (line.startsWith('#EXT-X-PLAYLIST-TYPE:')) playlistType = line.split(':')[1]
    else if (line === '#EXT-X-ENDLIST') endList = true
    else if (line.startsWith('#EXTINF:')) {
      segments.push({
        duration: Number(line.slice('#EXTINF:'.length).split(',')[0]),
        uri: lines.slice(i + 1).find((l) => l && !l.startsWith('#')) ?? '',
      })
    }
  })
  return { targetDuration, playlistType, endList, segments }
}

const total = (media) => media.segments.reduce((sum, s) => sum + s.duration, 0)

/**
 * @param {ReturnType<typeof parseMaster>} variants
 * @param {Record<string, ReturnType<typeof parseMedia>>} medias  uri de la variante -> playlist
 * @param {{ segmentSeconds?: number, sourceDuration?: number, sourceResolution?: { width: number, height: number } }} opts
 * @returns {string[]} errores; vacío = válido
 */
export function validateLadder(variants, medias, opts = {}) {
  const errors = []
  const seg = opts.segmentSeconds ?? 6

  // VID-01
  if (variants.length < 3) errors.push(`VID-01 se esperaban ≥3 calidades, hay ${variants.length}`)
  const heights = variants.map((v) => v.resolution?.height)
  if (new Set(heights).size !== heights.length) errors.push('VID-01 hay calidades con la misma resolución')
  const uris = variants.map((v) => v.uri)
  if (new Set(uris).size !== uris.length) errors.push('VID-01 hay calidades que apuntan a la misma playlist')
  for (const v of variants) {
    if (!Number.isFinite(v.bandwidth)) errors.push(`VID-01 ${v.uri} sin BANDWIDTH`)
    if (!v.resolution) errors.push(`VID-01 ${v.uri} sin RESOLUTION`)
    if (!v.codecs) errors.push(`VID-01 ${v.uri} sin CODECS`)
  }

  for (const v of variants) {
    const media = medias[v.uri]
    if (!media) {
      errors.push(`VID-01 no se pudo leer la playlist ${v.uri}`)
      continue
    }

    // VID-02
    if (media.playlistType !== 'VOD') errors.push(`VID-02 ${v.uri} no es PLAYLIST-TYPE:VOD`)
    if (!media.endList) errors.push(`VID-02 ${v.uri} sin EXT-X-ENDLIST`)

    // VID-03
    media.segments.forEach((s, i) => {
      const isLast = i === media.segments.length - 1
      if (!isLast && Math.abs(s.duration - seg) > 0.1) {
        errors.push(`VID-03 ${v.uri} segmento ${i} dura ${s.duration}s (se esperaban ${seg}s)`)
      }
      if (s.duration > media.targetDuration + 0.5) {
        errors.push(`VID-03 ${v.uri} segmento ${i} (${s.duration}s) supera TARGETDURATION ${media.targetDuration}`)
      }
    })

    // VID-05
    if (opts.sourceDuration !== undefined && Math.abs(total(media) - opts.sourceDuration) > 1) {
      errors.push(`VID-05 ${v.uri} dura ${total(media).toFixed(2)}s, el original ${opts.sourceDuration}s`)
    }
  }

  // VID-04
  const readable = variants.map((v) => medias[v.uri]).filter(Boolean)
  if (readable.length > 1) {
    const [ref, ...rest] = readable
    rest.forEach((media, k) => {
      const uri = variants.filter((v) => medias[v.uri])[k + 1].uri
      if (media.segments.length !== ref.segments.length) {
        errors.push(`VID-04 ${uri} tiene ${media.segments.length} segmentos, la primera calidad ${ref.segments.length}`)
        return
      }
      media.segments.forEach((s, i) => {
        if (Math.abs(s.duration - ref.segments[i].duration) > 0.05) {
          errors.push(`VID-04 ${uri} segmento ${i} desalineado (${s.duration}s vs ${ref.segments[i].duration}s)`)
        }
      })
    })
  }

  // VID-06
  if (opts.sourceResolution) {
    const maxHeight = Math.max(...variants.map((v) => v.resolution?.height ?? 0))
    if (maxHeight !== opts.sourceResolution.height) {
      errors.push(`VID-06 la calidad más alta es ${maxHeight}p, el original ${opts.sourceResolution.height}p`)
    }
    for (const v of variants) {
      if (v.resolution && (v.resolution.width > opts.sourceResolution.width || v.resolution.height > opts.sourceResolution.height)) {
        errors.push(`VID-06 ${v.uri} (${v.resolution.width}x${v.resolution.height}) supera al original`)
      }
    }
  }

  return errors
}

/** Duración total de una playlist de medios, en segundos */
export function mediaDuration(media) {
  return total(media)
}
