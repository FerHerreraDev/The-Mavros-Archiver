import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { applyTmdbAction, fillEpisodesFromTmdbAction, searchTmdbAction } from '@/lib/actions/tmdb.actions'
import { resetRequest } from '../helpers/request-context'
import { adminClient, createUser, deleteUsers, randomIp, sessionCookies, type TestUser } from '../helpers/users'
import { startFakeTmdb, tmdbFixtures } from '../helpers/fake-tmdb'

let boss: TestUser
let viewer: TestUser
let tmdb: Awaited<ReturnType<typeof startFakeTmdb>>
const tag = Math.random().toString(36).slice(2, 8)
const SHOW = 1396
const MOVIE = 149

beforeAll(async () => {
  tmdb = await startFakeTmdb(tmdbFixtures(SHOW, MOVIE))
  vi.stubEnv('TMDB_API_KEY', 'clave-de-prueba')
  vi.stubEnv('TMDB_API_URL', tmdb.url)
  // Las imágenes apuntan a un host que no existe: se guarda la URL y no hay copia (LOAD-03 sigue)
  vi.stubEnv('TMDB_IMAGE_URL', 'https://image.invalid/t/p')
  ;[boss, viewer] = await Promise.all([createUser({ role: 'admin', prefix: 'tmdb-boss' }), createUser({ prefix: 'tmdb-viewer' })])
})

afterAll(async () => {
  await adminClient().from('series').delete().like('slug', `%${tag}%`)
  await adminClient().from('movies').delete().like('slug', `%${tag}%`)
  await deleteUsers([boss.id, viewer.id])
  vi.unstubAllEnvs()
  await tmdb.close()
})

async function as(user: TestUser) {
  resetRequest({ ip: randomIp(), cookies: await sessionCookies(user) })
}

describe('TMDB en el panel (TMDB-02)', () => {
  it('buscar devuelve los resultados; un user no puede', async () => {
    await as(boss)
    const res = await searchTmdbAction({ kind: 'series', query: 'Serie', year: 2008 })
    expect(res.results?.[0]).toMatchObject({ tmdbId: SHOW, title: 'Serie TMDB', year: 2008 })
    await as(viewer)
    expect((await searchTmdbAction({ kind: 'movie', query: 'x' })).error).toMatch(/denegado/i)
  })

  it('elegir una serie llena solo lo vacío, guarda su id y no toca el título', async () => {
    const { data: show } = await adminClient()
      .from('series')
      .insert({ slug: `tmdb-serie-${tag}`, title: 'Mi título', synopsis: 'Mi sinopsis' })
      .select('id')
      .single()
    await as(boss)
    expect((await applyTmdbAction({ kind: 'series', id: show!.id, tmdbId: SHOW })).success).toBeTruthy()

    const { data } = await adminClient().from('series').select('*').eq('id', show!.id).single()
    expect(data).toMatchObject({
      title: 'Mi título',
      synopsis: 'Mi sinopsis',
      original_title: 'TMDB Show',
      release_year: 2008,
      genres: ['drama', 'crimen'],
      poster_url: 'https://image.invalid/t/p/w780/sp.jpg',
      backdrop_url: 'https://image.invalid/t/p/w1280/sb.jpg',
      tmdb_id: SHOW,
    })
  })

  it('elegir una película la llena (sin imagen horizontal); un user no puede aplicar', async () => {
    const { data: movie } = await adminClient()
      .from('movies')
      .insert({ slug: `tmdb-peli-${tag}`, title: 'Akira', duration_seconds: 10, hls_path: 'ladder/master.m3u8' })
      .select('id')
      .single()
    await as(viewer)
    expect((await applyTmdbAction({ kind: 'movie', id: movie!.id, tmdbId: MOVIE })).error).toMatch(/denegado/i)
    await as(boss)
    await applyTmdbAction({ kind: 'movie', id: movie!.id, tmdbId: MOVIE })
    const { data } = await adminClient().from('movies').select('*').eq('id', movie!.id).single()
    expect(data).toMatchObject({ title: 'Akira', synopsis: 'Neo-Tokio, 2019.', release_year: 1988, genres: ['animación', 'ciencia ficción'], tmdb_id: MOVIE })
  })
})

describe('completar episodios (TMDB-03)', () => {
  it('título si es genérico, sinopsis e imagen si faltan; en inglés si no hay español', async () => {
    const { data: show } = await adminClient().from('series').insert({ slug: `tmdb-eps-${tag}`, title: 'Eps', tmdb_id: SHOW }).select('id').single()
    const ep = (n: number, fields: Record<string, unknown>) => ({
      slug: `tmdb-eps-${tag}-${n}`,
      duration_seconds: 10,
      hls_path: 'ladder/master.m3u8',
      series_id: show!.id,
      season_number: 1,
      episode_number: n,
      ...fields,
    })
    await adminClient().from('movies').insert([ep(1, { title: 'Episodio 1' }), ep(2, { title: 'Mi nombre', synopsis: 'Mía' }), ep(3, { title: 'Episodio 3' })])

    await as(boss)
    expect((await fillEpisodesFromTmdbAction({ seriesId: show!.id })).success).toBe('2 episodios completados desde TMDB.')
    const { data } = await adminClient().from('movies').select('episode_number, title, synopsis, poster_url').eq('series_id', show!.id).order('episode_number')
    expect(data).toEqual([
      { episode_number: 1, title: 'Piloto', synopsis: 'Empieza todo.', poster_url: 'https://image.invalid/t/p/w780/e1.jpg' },
      { episode_number: 2, title: 'Mi nombre', synopsis: 'Mía', poster_url: 'https://image.invalid/t/p/w780/e2.jpg' },
      { episode_number: 3, title: 'Episodio 3', synopsis: null, poster_url: null },
    ])
  })

  it('una serie sin vincular lo pide primero', async () => {
    const { data: show } = await adminClient().from('series').insert({ slug: `tmdb-sin-${tag}`, title: 'Sin' }).select('id').single()
    await as(boss)
    expect((await fillEpisodesFromTmdbAction({ seriesId: show!.id })).error).toMatch(/vincula/i)
  })
})

describe('sin clave (TMDB-01)', () => {
  it('dice que falta configurarla y no cambia nada', async () => {
    vi.stubEnv('TMDB_API_KEY', '')
    await as(boss)
    expect((await searchTmdbAction({ kind: 'movie', query: 'Akira' })).error).toMatch(/TMDB_API_KEY/)
    vi.stubEnv('TMDB_API_KEY', 'clave-de-prueba')
  })
})
