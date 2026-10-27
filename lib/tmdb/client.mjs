// Cliente mínimo de TMDB (TMDB-01..TMDB-05). Lo usan el servidor (panel) y la carpeta de la Mac.
// Solo LEE datos públicos de TMDB; la clave nunca sale del servidor ni de la Mac.
const LANGUAGE = 'es-MX'
const FALLBACK_LANGUAGE = 'en-US'
const TIMEOUT_MS = 10_000

export const TMDB_NOT_CONFIGURED = 'Falta configurar TMDB_API_KEY en el servidor.'

/** Igual que normalizeGenres de lib/movies.ts (la prueba compara ambos) */
export function normalizeGenreList(names) {
  const seen = new Set()
  for (const raw of names) {
    const genre = String(raw).trim().toLowerCase().replace(/\s+/g, ' ')
    if (genre) seen.add(genre)
  }
  return [...seen]
}

/** "Episodio 3", "Episode 3", vacío: TMDB no tiene el título real en ese idioma */
export const isGenericEpisodeTitle = (title) => !title || /^(episodio|episode|capítulo)\s+\d+$/i.test(String(title).trim())

const yearOf = (date) => (date && /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : null)

/**
 * Cliente con la clave de [env]. La clave puede ser la "API key" (v3) o el "API Read Access Token"
 * (v4, empieza con eyJ). null si no hay clave.
 */
export function createTmdb(env = process.env, fetchImpl = fetch) {
  const key = env.TMDB_API_KEY?.trim()
  if (!key) return null
  const api = (env.TMDB_API_URL ?? 'https://api.themoviedb.org/3').replace(/\/+$/, '')
  const images = (env.TMDB_IMAGE_URL ?? 'https://image.tmdb.org/t/p').replace(/\/+$/, '')
  const bearer = key.startsWith('eyJ')

  async function get(path, params = {}) {
    const url = new URL(`${api}${path}`)
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
    if (!bearer) url.searchParams.set('api_key', key)
    const res = await fetchImpl(url, {
      headers: { accept: 'application/json', ...(bearer ? { authorization: `Bearer ${key}` } : {}) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`TMDB respondió ${res.status}`)
    return res.json()
  }

  const image = (size, path) => (path ? `${images}/${size}${path}` : null)

  const result = (r, kind) => ({
    tmdbId: r.id,
    title: (kind === 'tv' ? r.name : r.title) ?? '',
    originalTitle: (kind === 'tv' ? r.original_name : r.original_title) ?? null,
    year: yearOf(kind === 'tv' ? r.first_air_date : r.release_date),
    posterUrl: image('w342', r.poster_path),
    overview: r.overview || null,
  })

  /** Detalles en español; la sinopsis en inglés si no hay traducción */
  async function details(kind, id) {
    const data = await get(`/${kind}/${id}`, { language: LANGUAGE })
    if (!data) return null
    let overview = data.overview
    if (!overview) overview = (await get(`/${kind}/${id}`, { language: FALLBACK_LANGUAGE }))?.overview
    const title = kind === 'tv' ? data.name : data.title
    const original = kind === 'tv' ? data.original_name : data.original_title
    return {
      tmdb_id: data.id,
      // Solo si es distinto del título en español: si no, no aporta
      original_title: original && original !== title ? original : null,
      synopsis: overview ? overview.slice(0, 2000) : null,
      release_year: yearOf(kind === 'tv' ? data.first_air_date : data.release_date),
      genres: normalizeGenreList((data.genres ?? []).map((g) => g.name)),
      poster_url: image('w780', data.poster_path),
      backdrop_url: image('w1280', data.backdrop_path),
    }
  }

  return {
    /** Hasta 5 resultados para elegir (TMDB-02) */
    async search(kind, query, year) {
      const yearParam = kind === 'tv' ? 'first_air_date_year' : 'year'
      let data = await get(`/search/${kind}`, { query, language: LANGUAGE, [yearParam]: year })
      // Con el año a veces no hay nada (fechas distintas por país): se reintenta sin él
      if (year && !data?.results?.length) data = await get(`/search/${kind}`, { query, language: LANGUAGE })
      return (data?.results ?? []).slice(0, 5).map((r) => result(r, kind))
    },
    movie: (id) => details('movie', id),
    series: (id) => details('tv', id),

    /** Episodios de una temporada: número → { title, synopsis, still_url } (TMDB-03) */
    async season(id, season) {
      const data = await get(`/tv/${id}/season/${season}`, { language: LANGUAGE })
      if (!data) return new Map()
      const episodes = data.episodes ?? []
      const needsFallback = episodes.some((e) => isGenericEpisodeTitle(e.name) || !e.overview)
      const english = needsFallback ? await get(`/tv/${id}/season/${season}`, { language: FALLBACK_LANGUAGE }) : null
      const byNumber = new Map((english?.episodes ?? []).map((e) => [e.episode_number, e]))
      return new Map(
        episodes.map((e) => {
          const en = byNumber.get(e.episode_number)
          const title = !isGenericEpisodeTitle(e.name) ? e.name : !isGenericEpisodeTitle(en?.name) ? en.name : null
          const overview = e.overview || en?.overview || null
          return [e.episode_number, { title: title ? title.slice(0, 200) : null, synopsis: overview ? overview.slice(0, 2000) : null, still_url: image('w780', e.still_path) }]
        }),
      )
    },
  }
}

/** Campos a escribir: solo los que estaban vacíos (TMDB nunca pisa lo que ya escribiste) */
export function fillEmpty(current, incoming) {
  const out = {}
  for (const [key, value] of Object.entries(incoming)) {
    if (value === null || value === undefined) continue
    if (Array.isArray(value) && value.length === 0) continue
    const now = current[key]
    const empty = now === null || now === undefined || now === '' || (Array.isArray(now) && now.length === 0)
    if (empty) out[key] = value
  }
  return out
}
