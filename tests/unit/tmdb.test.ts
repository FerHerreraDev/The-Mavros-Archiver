import { describe, it, expect } from 'vitest'
import { createTmdb, fillEmpty, isGenericEpisodeTitle, normalizeGenreList } from '@/lib/tmdb/client.mjs'
import { normalizeGenres } from '@/lib/movies'

type Routes = Record<string, unknown>
/** fetch falso: responde según "ruta?language" y guarda lo que se pidió */
function fakeFetch(routes: Routes) {
  const calls: { url: URL; headers: Record<string, string> }[] = []
  const impl = (async (input: URL, init?: RequestInit) => {
    const url = new URL(input)
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> })
    const key = `${url.pathname}?${url.searchParams.get('language') ?? ''}`
    const body = routes[key] ?? routes[url.pathname]
    if (body === undefined) return new Response('{}', { status: 404 })
    if (body === 500) return new Response('boom', { status: 500 })
    return new Response(JSON.stringify(body), { status: 200 })
  }) as unknown as typeof fetch
  return { impl, calls }
}

const env = (key = 'v3key') => ({ TMDB_API_KEY: key, TMDB_API_URL: 'https://api.test/3', TMDB_IMAGE_URL: 'https://img.test/t/p' })

describe('TMDB: configuración (TMDB-01)', () => {
  it('sin clave no hay cliente', () => {
    expect(createTmdb({})).toBeNull()
    expect(createTmdb({ TMDB_API_KEY: '  ' })).toBeNull()
  })

  it('API key v3 va en la URL; token v4 (eyJ…) va en el header', async () => {
    const v3 = fakeFetch({ '/3/search/movie': { results: [] } })
    await createTmdb(env(), v3.impl)!.search('movie', 'Akira')
    expect(v3.calls[0].url.searchParams.get('api_key')).toBe('v3key')
    expect(v3.calls[0].headers.authorization).toBeUndefined()

    const v4 = fakeFetch({ '/3/search/movie': { results: [] } })
    await createTmdb(env('eyJtoken'), v4.impl)!.search('movie', 'Akira')
    expect(v4.calls[0].url.searchParams.get('api_key')).toBeNull()
    expect(v4.calls[0].headers.authorization).toBe('Bearer eyJtoken')
  })

  it('un error del servidor se reporta (quien llama decide seguir sin TMDB)', async () => {
    const f = fakeFetch({ '/3/movie/1': 500 })
    await expect(createTmdb(env(), f.impl)!.movie(1)).rejects.toThrow(/500/)
  })
})

describe('TMDB: búsqueda y detalles (TMDB-02)', () => {
  it('hasta 5 resultados con título, año y póster; con año y sin resultados reintenta sin año', async () => {
    const results = Array.from({ length: 7 }, (_, i) => ({ id: i + 1, name: `Serie ${i}`, original_name: 'Orig', first_air_date: '2008-01-20', poster_path: `/p${i}.jpg`, overview: '' }))
    let first = true
    const f = fakeFetch({})
    const impl = (async (input: URL, init?: RequestInit) => {
      const url = new URL(input)
      if (url.searchParams.get('first_air_date_year') && first) {
        first = false
        return new Response(JSON.stringify({ results: [] }))
      }
      return f.impl(input, init).then(() => new Response(JSON.stringify({ results })))
    }) as unknown as typeof fetch
    const found = await createTmdb(env(), impl)!.search('tv', 'Breaking Bad', 2008)
    expect(found).toHaveLength(5)
    expect(found[0]).toEqual({ tmdbId: 1, title: 'Serie 0', originalTitle: 'Orig', year: 2008, posterUrl: 'https://img.test/t/p/w342/p0.jpg', overview: null })
  })

  it('detalles en español con géneros normalizados; la sinopsis en inglés si no hay traducción', async () => {
    const f = fakeFetch({
      '/3/tv/1396?es-MX': { id: 1396, name: 'Breaking Bad', original_name: 'Breaking Bad', overview: '', first_air_date: '2008-01-20', genres: [{ name: 'Drama' }, { name: 'Crimen ' }], poster_path: '/p.jpg', backdrop_path: '/b.jpg' },
      '/3/tv/1396?en-US': { overview: 'A chemistry teacher…' },
    })
    expect(await createTmdb(env(), f.impl)!.series(1396)).toEqual({
      tmdb_id: 1396,
      original_title: null,
      synopsis: 'A chemistry teacher…',
      release_year: 2008,
      genres: ['drama', 'crimen'],
      poster_url: 'https://img.test/t/p/w780/p.jpg',
      backdrop_url: 'https://img.test/t/p/w1280/b.jpg',
    })
  })

  it('título original solo si es distinto; inexistente → null', async () => {
    const f = fakeFetch({ '/3/movie/129?es-MX': { id: 129, title: 'El viaje de Chihiro', original_title: '千と千尋の神隠し', overview: 'Chihiro…', release_date: '2001-07-20', genres: [] } })
    const tmdb = createTmdb(env(), f.impl)!
    expect((await tmdb.movie(129))?.original_title).toBe('千と千尋の神隠し')
    expect(await tmdb.movie(999)).toBeNull()
  })
})

describe('TMDB: episodios (TMDB-03)', () => {
  it('título y sinopsis en español; en inglés si el español es genérico o vacío; imagen 16:9', async () => {
    const f = fakeFetch({
      '/3/tv/1/season/1?es-MX': {
        episodes: [
          { episode_number: 1, name: 'Piloto', overview: 'Walter…', still_path: '/s1.jpg' },
          { episode_number: 2, name: 'Episodio 2', overview: '', still_path: null },
        ],
      },
      '/3/tv/1/season/1?en-US': { episodes: [{ episode_number: 2, name: "Cat's in the Bag...", overview: 'Walt and Jesse…' }] },
    })
    const eps = await createTmdb(env(), f.impl)!.season(1, 1)
    expect(eps.get(1)).toEqual({ title: 'Piloto', synopsis: 'Walter…', still_url: 'https://img.test/t/p/w780/s1.jpg' })
    expect(eps.get(2)).toEqual({ title: "Cat's in the Bag...", synopsis: 'Walt and Jesse…', still_url: null })
  })

  it('temporada que no existe → sin episodios', async () => {
    expect((await createTmdb(env(), fakeFetch({}).impl)!.season(1, 9)).size).toBe(0)
  })

  it('títulos genéricos', () => {
    for (const t of ['Episodio 3', 'episode 12', 'Capítulo 1', '', null]) expect(isGenericEpisodeTitle(t)).toBe(true)
    for (const t of ['Piloto', 'Episodio especial', 'Episode 3: The Return']) expect(isGenericEpisodeTitle(t)).toBe(false)
  })
})

describe('TMDB: nunca pisa lo escrito (TMDB-02, TMDB-05)', () => {
  it('solo campos vacíos; ignora lo que TMDB no trae', () => {
    const current = { synopsis: 'Mía', original_title: null, genres: [], release_year: null, poster_url: '' }
    const incoming = { synopsis: 'De TMDB', original_title: 'Orig', genres: ['drama'], release_year: 2008, poster_url: 'https://x/p.jpg', backdrop_url: null }
    expect(fillEmpty(current, incoming)).toEqual({ original_title: 'Orig', genres: ['drama'], release_year: 2008, poster_url: 'https://x/p.jpg' })
  })

  it('géneros normalizados igual que la app (MOV-10)', () => {
    const names = ['Acción y Aventura', ' Ciencia  ficción ', 'acción y aventura', '']
    expect(normalizeGenreList(names)).toEqual(normalizeGenres(names.join(',')))
  })
})
