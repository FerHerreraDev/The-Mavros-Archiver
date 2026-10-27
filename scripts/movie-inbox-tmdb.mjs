// Datos automáticos para la carpeta de entrada (TMDB-04): títulos, sinopsis e imágenes de TMDB y,
// si un episodio no tiene imagen, un cuadro del propio video. Nada de esto puede hacer fallar
// el procesado: ante cualquier error se registra y se sigue con lo que haya.
import { execFile } from 'node:child_process'
import { BACKDROP_MAX_WIDTH, POSTER_MAX_WIDTH, processImageBytes, uploadImage } from '../lib/poster/image.mjs'
import { fillEmpty, isGenericEpisodeTitle } from '../lib/tmdb/client.mjs'

const IMAGE_MAX_BYTES = 15 * 1024 * 1024
const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`)

/** Imagen de TMDB (host fijo, https): bytes o null */
export async function downloadImage(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    if (!res.ok || !String(res.headers.get('content-type')).startsWith('image/')) return null
    const bytes = Buffer.from(await res.arrayBuffer())
    return bytes.length <= IMAGE_MAX_BYTES ? bytes : null
  } catch {
    return null
  }
}

/** Copia optimizada en el bucket + vista previa (LOAD-03/07): { image_url, thumbhash } con lo que salga */
async function store(db, bytes, maxWidth) {
  if (!bytes) return { image_url: null, thumbhash: null }
  const { image, thumbhash } = await processImageBytes(bytes, maxWidth)
  return { image_url: image ? await uploadImage(db, image) : null, thumbhash }
}

/** Campos de imagen para una URL nueva de TMDB (póster o imagen horizontal) */
async function imageFields(db, url, prefix, maxWidth) {
  if (!url) return {}
  const { image_url, thumbhash } = await store(db, await downloadImage(url), maxWidth)
  return { [`${prefix}_image_url`]: image_url, [`${prefix}_thumbhash`]: thumbhash }
}

/** Un cuadro JPEG del video en el segundo [at] (~25 % de la duración, lejos de logos y créditos) */
export function frameFromVideo(source, at) {
  return new Promise((resolve) => {
    execFile(
      'ffmpeg',
      ['-v', 'error', '-ss', String(Math.max(0, at)), '-i', source, '-frames:v', '1', '-vf', 'scale=1280:-2', '-f', 'image2', '-c:v', 'mjpeg', 'pipe:1'],
      { encoding: 'buffer', maxBuffer: IMAGE_MAX_BYTES },
      (err, stdout) => resolve(err || !stdout.length ? null : stdout),
    )
  })
}

const first = async (tmdb, kind, title, year) => (await tmdb.search(kind, title, year))[0] ?? null

/** Película nueva: llena lo vacío con el primer resultado de TMDB (el título no cambia) */
export async function enrichMovie(db, tmdb, id, { title, year }) {
  if (!tmdb) return
  try {
    const hit = await first(tmdb, 'movie', title, year)
    if (!hit) return log(`TMDB: sin resultado para la película "${title}"`)
    const details = await tmdb.movie(hit.tmdbId)
    if (!details) return
    const { data: current } = await db.from('movies').select('*').eq('id', id).single()
    // Una película no tiene imagen horizontal
    const { tmdb_id, ...rest } = details
    delete rest.backdrop_url
    const updates = fillEmpty(current, rest)
    Object.assign(updates, await imageFields(db, updates.poster_url, 'poster', POSTER_MAX_WIDTH), { tmdb_id })
    await db.from('movies').update(updates).eq('id', id)
    log(`TMDB: "${title}" → ${hit.title} (${hit.year ?? 's/a'})`)
  } catch (err) {
    log(`TMDB: no se pudo completar "${title}": ${err.message}`)
  }
}

/** Serie nueva: campos para crearla ya con datos e imágenes de TMDB ({} si no hay) */
export async function seriesFieldsFromTmdb(db, tmdb, { title, year }) {
  if (!tmdb) return {}
  try {
    const hit = await first(tmdb, 'tv', title, year)
    if (!hit) {
      log(`TMDB: sin resultado para la serie "${title}"`)
      return {}
    }
    const details = await tmdb.series(hit.tmdbId)
    if (!details) return {}
    log(`TMDB: serie "${title}" → ${hit.title} (${hit.year ?? 's/a'})`)
    return {
      ...details,
      // El año del nombre del archivo manda; si no venía, el de TMDB
      release_year: year ?? details.release_year,
      ...(await imageFields(db, details.poster_url, 'poster', POSTER_MAX_WIDTH)),
      ...(await imageFields(db, details.backdrop_url, 'backdrop', BACKDROP_MAX_WIDTH)),
    }
  } catch (err) {
    log(`TMDB: no se pudo completar la serie "${title}": ${err.message}`)
    return {}
  }
}

/**
 * Episodio: título (si el del archivo es genérico), sinopsis e imagen de TMDB; sin imagen en TMDB,
 * un cuadro del video (TMDB-04).
 */
export async function enrichEpisode(db, tmdb, id, { seriesTmdbId, season, episode, source, duration }) {
  const updates = {}
  try {
    if (tmdb && seriesTmdbId) {
      const data = (await tmdb.season(seriesTmdbId, season)).get(episode)
      if (data) {
        const { data: current } = await db.from('movies').select('title, synopsis, poster_url').eq('id', id).single()
        Object.assign(updates, fillEmpty(current, { synopsis: data.synopsis, poster_url: data.still_url }))
        if (data.title && isGenericEpisodeTitle(current.title)) updates.title = data.title
        Object.assign(updates, await imageFields(db, updates.poster_url, 'poster', POSTER_MAX_WIDTH))
      }
    }
  } catch (err) {
    log(`TMDB: no se pudo completar T${season}:E${episode}: ${err.message}`)
  }
  try {
    if (!updates.poster_url) {
      const { image_url, thumbhash } = await store(db, await frameFromVideo(source, duration * 0.25), POSTER_MAX_WIDTH)
      if (image_url) Object.assign(updates, { poster_image_url: image_url, poster_thumbhash: thumbhash })
    }
    if (Object.keys(updates).length) await db.from('movies').update(updates).eq('id', id)
  } catch (err) {
    log(`Imagen del episodio T${season}:E${episode}: ${err.message}`)
  }
}
