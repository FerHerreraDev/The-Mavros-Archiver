import { parseMaster, parseMedia, mediaDuration } from '@/lib/hls/playlist.mjs'

export type HlsProbe = { ok: true; durationSeconds: number; variants: number } | { ok: false; error: string }

/**
 * Comprueba que `baseUrl + path` es un master HLS válido y devuelve su duración (MOV-08).
 * `fetchFn` es inyectable para poder probarlo sin red.
 */
export async function probeHlsMaster(
  baseUrl: string,
  path: string,
  fetchFn: typeof fetch = fetch,
  timeoutMs = 10_000
): Promise<HlsProbe> {
  const base = baseUrl.replace(/\/+$/, '')
  const masterUrl = `${base}/${path.replace(/^\/+/, '')}`

  const get = async (url: string) => {
    const res = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' })
    if (!res.ok) throw new Error(`status ${res.status}`)
    return res.text()
  }

  let masterText: string
  try {
    masterText = await get(masterUrl)
  } catch (err) {
    return { ok: false, error: `No se encontró el video en ${masterUrl} (${(err as Error).message})` }
  }

  if (!masterText.trimStart().startsWith('#EXTM3U')) {
    return { ok: false, error: 'El archivo no es una playlist HLS (#EXTM3U).' }
  }

  const variants = parseMaster(masterText)
  if (variants.length === 0) {
    return { ok: false, error: 'La playlist no es un master (no tiene calidades #EXT-X-STREAM-INF).' }
  }

  try {
    const media = parseMedia(await get(new URL(variants[0].uri, masterUrl).href))
    if (!media.endList || media.segments.length === 0) {
      return { ok: false, error: 'La playlist de video está incompleta (sin segmentos o sin #EXT-X-ENDLIST).' }
    }
    return { ok: true, durationSeconds: Math.round(mediaDuration(media)), variants: variants.length }
  } catch (err) {
    return { ok: false, error: `No se pudo leer la calidad ${variants[0].uri} (${(err as Error).message})` }
  }
}
