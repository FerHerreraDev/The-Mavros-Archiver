import { createServer, type Server } from 'node:http'

/**
 * TMDB falso para pruebas: responde JSON según "ruta?language" (o solo la ruta) y cuenta las
 * peticiones. Nunca se llama al TMDB real desde las pruebas.
 */
export async function startFakeTmdb(routes: Record<string, unknown>) {
  const requests: string[] = []
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    requests.push(`${url.pathname}?${url.searchParams.toString()}`)
    const body = routes[`${url.pathname}?${url.searchParams.get('language') ?? ''}`] ?? routes[url.pathname]
    if (body === undefined) {
      res.writeHead(404, { 'content-type': 'application/json' }).end('{}')
      return
    }
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as { port: number }
  return { url: `http://127.0.0.1:${port}/3`, requests, close: () => new Promise((r) => server.close(r)) }
}

/** Respuestas de TMDB con la forma real (campos que usa la app) */
export const tmdbFixtures = (showId: number, movieId: number) => ({
  '/3/search/tv': { results: [{ id: showId, name: 'Serie TMDB', original_name: 'TMDB Show', first_air_date: '2008-01-20', poster_path: '/sp.jpg', overview: 'Resumen' }] },
  '/3/search/movie': { results: [{ id: movieId, title: 'Peli TMDB', original_title: 'TMDB Movie', release_date: '1988-07-16', poster_path: '/mp.jpg', overview: 'Neo-Tokio' }] },
  [`/3/tv/${showId}?es-MX`]: {
    id: showId,
    name: 'Serie TMDB',
    original_name: 'TMDB Show',
    overview: 'Sinopsis de la serie.',
    first_air_date: '2008-01-20',
    genres: [{ name: 'Drama' }, { name: 'Crimen' }],
    poster_path: '/sp.jpg',
    backdrop_path: '/sb.jpg',
  },
  [`/3/tv/${showId}/season/1?es-MX`]: {
    episodes: [
      { episode_number: 1, name: 'Piloto', overview: 'Empieza todo.', still_path: '/e1.jpg' },
      { episode_number: 2, name: 'Episodio 2', overview: '', still_path: '/e2.jpg' },
    ],
  },
  [`/3/tv/${showId}/season/1?en-US`]: { episodes: [{ episode_number: 2, name: 'The Cat', overview: 'Second one.' }] },
  [`/3/movie/${movieId}?es-MX`]: {
    id: movieId,
    title: 'Peli TMDB',
    original_title: 'TMDB Movie',
    overview: 'Neo-Tokio, 2019.',
    release_date: '1988-07-16',
    genres: [{ name: 'Animación' }, { name: 'Ciencia ficción' }],
    poster_path: '/mp.jpg',
    backdrop_path: '/mb.jpg',
  },
})
