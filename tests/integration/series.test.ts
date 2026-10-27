import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import path from 'node:path'
import type { Server } from 'node:http'
import { createMovieAction } from '@/lib/actions/movie.actions'
import {
  createSeriesAction,
  deleteSeriesAction,
  publishSeriesDraftsAction,
  setSeriesStatusAction,
  updateSeriesAction,
} from '@/lib/actions/series.actions'
import { listMoviesForAdmin } from '@/lib/data/movies'
import { getCatalog, getSeriesPage, getWatchable } from '@/lib/data/catalog'
import { resetRequest, runAndCaptureRedirect, formData } from '../helpers/request-context'
import { adminClient, createUser, deleteUsers, randomIp, sessionCookies, type TestUser } from '../helpers/users'
import { startVideoCdn, TEST_VIDEO_SECRET } from '../helpers/video-cdn-server'

// Otras pruebas crean datos en paralelo: aquí solo se comprueban los propios (por id/slug), nunca totales
let server: Server
let boss: TestUser
let viewer: TestUser
const tag = Math.random().toString(36).slice(2, 8)
const uniq = () => Math.random().toString(36).slice(2, 8)

beforeAll(async () => {
  server = await startVideoCdn(path.join(__dirname, '../fixtures/hls'), TEST_VIDEO_SECRET)
  const { port } = server.address() as { port: number }
  vi.stubEnv('VIDEO_CDN_URL', `http://127.0.0.1:${port}`)
  vi.stubEnv('VIDEO_TOKEN_SECRET', TEST_VIDEO_SECRET)
  ;[boss, viewer] = await Promise.all([createUser({ role: 'admin', prefix: 'ser-boss' }), createUser({ prefix: 'ser-viewer' })])
})

afterAll(async () => {
  await adminClient().from('series').delete().like('slug', `%${tag}%`)
  await adminClient().from('movies').delete().like('slug', `%${tag}%`)
  await deleteUsers([boss.id, viewer.id])
  vi.unstubAllEnvs()
  server.close()
})

async function as(user: TestUser | null) {
  resetRequest({ ip: randomIp(), cookies: user ? await sessionCookies(user) : undefined })
}

const seriesFields = (overrides: Record<string, string> = {}) =>
  formData({
    title: `Serie IT ${tag}`,
    slug: `serie-it-${tag}-${uniq()}`,
    original_title: '',
    synopsis: '',
    release_year: '2008',
    genres: 'Drama, Crimen',
    poster_url: '',
    ...overrides,
  })

async function insertSeries(fields: Record<string, unknown> = {}) {
  const { data, error } = await adminClient()
    .from('series')
    .insert({ slug: `s-${tag}-${uniq()}`, title: `Serie ${tag}`, ...fields })
    .select('id, slug')
    .single()
  if (error) throw error
  return data as { id: string; slug: string }
}

async function insertEpisode(seriesId: string, season: number, episode: number, fields: Record<string, unknown> = {}) {
  const { data, error } = await adminClient()
    .from('movies')
    .insert({
      slug: `e-${tag}-${uniq()}`,
      title: `Ep ${season}x${episode}`,
      duration_seconds: 1000,
      hls_path: 'ladder/master.m3u8',
      series_id: seriesId,
      season_number: season,
      episode_number: episode,
      status: 'published',
      ...fields,
    })
    .select('id, slug')
    .single()
  if (error) throw error
  return data as { id: string; slug: string }
}

describe('acciones de series (SER-05)', () => {
  it('un admin crea → borrador con su sesión; redirige a editarla', async () => {
    await as(boss)
    const fd = seriesFields({ slug: '' , title: `Breaking IT ${tag}` })
    const { redirect, result } = await runAndCaptureRedirect(() => createSeriesAction(fd))
    expect(result).toBeUndefined()
    const { data } = await adminClient().from('series').select('*').eq('slug', `breaking-it-${tag}`).single()
    expect(data).toMatchObject({ status: 'draft', created_by: boss.id, release_year: 2008, genres: ['drama', 'crimen'] })
    expect(redirect).toBe(`/dashboard/admin/series/${data!.id}/edit`)
  })

  it('errores por campo y slug repetido', async () => {
    await as(boss)
    const bad = await createSeriesAction(seriesFields({ title: '', release_year: '1500' }))
    expect(bad.fieldErrors?.title).toBeTruthy()
    expect(bad.fieldErrors?.release_year).toBeTruthy()

    const existing = await insertSeries()
    const dup = await createSeriesAction(seriesFields({ slug: existing.slug }))
    expect(dup.fieldErrors?.slug?.[0]).toMatch(/ya existe/i)
  })

  it('un user o un anónimo no puede crear, editar, publicar ni borrar', async () => {
    const target = await insertSeries()
    for (const user of [viewer, null]) {
      await as(user)
      expect((await createSeriesAction(seriesFields())).error).toMatch(/denegado/i)
      expect((await updateSeriesAction(target.id, seriesFields({ title: 'Hack' }))).error).toMatch(/denegado/i)
      expect((await setSeriesStatusAction({ id: target.id, status: 'published' })).error).toMatch(/denegado/i)
      expect((await deleteSeriesAction({ id: target.id })).error).toMatch(/denegado/i)
      expect((await publishSeriesDraftsAction({ id: target.id })).error).toMatch(/denegado/i)
    }
    const { data } = await adminClient().from('series').select('title, status').eq('id', target.id).single()
    expect(data).toEqual({ title: `Serie ${tag}`, status: 'draft' })
  })

  it('publicar, despublicar y borrar (con sus episodios)', async () => {
    const target = await insertSeries()
    const ep = await insertEpisode(target.id, 1, 1)
    await as(boss)
    expect((await setSeriesStatusAction({ id: target.id, status: 'published' })).success).toMatch(/publicada/)
    expect((await adminClient().from('series').select('status').eq('id', target.id).single()).data!.status).toBe('published')

    expect((await deleteSeriesAction({ id: target.id })).success).toMatch(/borrada/)
    expect((await adminClient().from('movies').select('id').eq('id', ep.id)).data).toEqual([])
  })
})

describe('episodios desde el formulario de película (SER-06)', () => {
  const episodeFields = (seriesId: string, overrides: Record<string, string> = {}) =>
    formData({
      title: 'Piloto',
      slug: '',
      original_title: '',
      synopsis: '',
      release_year: '',
      genres: '',
      poster_url: '',
      hls_path: 'ladder/master.m3u8',
      series_id: seriesId,
      season_number: '1',
      episode_number: '2',
      ...overrides,
    })

  it('sin slug → "<serie>-s01e02"; aparece en la lista con su serie', async () => {
    const series = await insertSeries()
    await as(boss)
    const { redirect } = await runAndCaptureRedirect(() => createMovieAction(episodeFields(series.id)))
    expect(redirect).toBe('/dashboard/admin/movies')

    const { data } = await adminClient().from('movies').select('*').eq('slug', `${series.slug}-s01e02`).single()
    expect(data).toMatchObject({ series_id: series.id, season_number: 1, episode_number: 2, status: 'draft', title: 'Piloto' })

    const list = await listMoviesForAdmin()
    expect(list!.find((m) => m.id === data!.id)?.series?.title).toBe(`Serie ${tag}`)
  })

  it('temporada/episodio repetidos → error en el campo', async () => {
    const series = await insertSeries()
    await insertEpisode(series.id, 1, 2)
    await as(boss)
    const result = await createMovieAction(episodeFields(series.id, { slug: `otro-${tag}-${uniq()}` }))
    expect(result.fieldErrors?.episode_number?.[0]).toMatch(/ya existe/i)
  })

  it('con serie, temporada y episodio son obligatorios', async () => {
    const series = await insertSeries()
    await as(boss)
    const result = await createMovieAction(episodeFields(series.id, { season_number: '', episode_number: '' }))
    expect(result.fieldErrors?.season_number).toBeTruthy()
    expect(result.fieldErrors?.episode_number).toBeTruthy()
  })

  it('sin serie, temporada y episodio se ignoran (película normal)', async () => {
    await as(boss)
    const slug = `peli-${tag}-${uniq()}`
    await runAndCaptureRedirect(() => createMovieAction(episodeFields('', { slug, season_number: '3', episode_number: '4' })))
    const { data } = await adminClient().from('movies').select('series_id, season_number, episode_number').eq('slug', slug).single()
    expect(data).toEqual({ series_id: null, season_number: null, episode_number: null })
  })
})

describe('publicar borradores de una serie (SER-07)', () => {
  it('publica solo los borradores de esa serie', async () => {
    const series = await insertSeries()
    const other = await insertSeries()
    const a = await insertEpisode(series.id, 1, 1, { status: 'draft' })
    const b = await insertEpisode(series.id, 1, 2, { status: 'draft' })
    const c = await insertEpisode(other.id, 1, 1, { status: 'draft' })
    await as(boss)
    expect((await publishSeriesDraftsAction({ id: series.id })).success).toBe('2 episodios publicados.')

    const { data } = await adminClient().from('movies').select('id, status').in('id', [a.id, b.id, c.id])
    const status = Object.fromEntries(data!.map((m) => [m.id, m.status]))
    expect(status).toEqual({ [a.id]: 'published', [b.id]: 'published', [c.id]: 'draft' })
  })
})

describe('catálogo, página de serie y reproducción', () => {
  const genre = `serie-genero-${tag}`
  let show: { id: string; slug: string }
  let empty: { id: string; slug: string }
  let hidden: { id: string; slug: string }
  const ep: Record<string, { id: string; slug: string }> = {}

  beforeAll(async () => {
    show = await insertSeries({ status: 'published', genres: [genre] })
    empty = await insertSeries({ status: 'published', genres: [genre] })
    hidden = await insertSeries({ status: 'draft' })
    ep.s1e1 = await insertEpisode(show.id, 1, 1)
    ep.s1e2 = await insertEpisode(show.id, 1, 2)
    ep.s1e3draft = await insertEpisode(show.id, 1, 3, { status: 'draft' })
    ep.s2e1 = await insertEpisode(show.id, 2, 1)
    ep.draftOnly = await insertEpisode(empty.id, 1, 1, { status: 'draft' })
    ep.hidden = await insertEpisode(hidden.id, 1, 1)
  })

  it('SER-08 los episodios no salen sueltos; la serie sale con sus temporadas; sin episodios visibles o en borrador no sale', async () => {
    for (const user of [viewer, boss]) {
      await as(user)
      const { recent, series } = await getCatalog()
      expect(recent.some((m) => Object.values(ep).some((e) => e.id === m.id))).toBe(false)
      const found = series.find((s) => s.id === show.id)
      expect(found).toMatchObject({ slug: show.slug, seasons: 2, episodes: 3 })
      expect(series.some((s) => s.id === empty.id || s.id === hidden.id)).toBe(false)
    }
  })

  it('SER-08 el filtro de género filtra series y sus géneros salen en los chips', async () => {
    await as(viewer)
    const all = await getCatalog()
    expect(all.genres).toContain(genre)
    const filtered = await getCatalog(genre)
    expect(filtered.series.map((s) => s.id)).toEqual([show.id])
    expect((await getCatalog(`no-${tag}`)).series).toEqual([])
  })

  it('SER-09 un user ve la serie publicada solo con episodios publicados; borrador → null; admin ve la vista previa', async () => {
    await as(viewer)
    const page = await getSeriesPage(show.slug)
    expect(page!.episodes.map((e) => e.id)).toEqual([ep.s1e1.id, ep.s1e2.id, ep.s2e1.id])
    expect(await getSeriesPage(hidden.slug)).toBeNull()

    await as(boss)
    const preview = await getSeriesPage(hidden.slug)
    expect(preview!.episodes.map((e) => e.id)).toEqual([ep.hidden.id])
  })

  it('SER-10 / SER-11 qué sigue y "Seguir viendo" con el progreso del usuario', async () => {
    const watcher = await createUser({ prefix: 'ser-watcher' })
    try {
      await as(watcher)
      expect((await getSeriesPage(show.slug))!.next).toMatchObject({ action: 'start', episode: { id: ep.s1e1.id } })
      expect((await getCatalog()).continueWatching.some((c) => c.episode?.series.id === show.id)).toBe(false)

      // Terminó T1:E2 → sigue T2:E1 (el T1:E3 en borrador no cuenta para un user)
      await adminClient().from('watch_progress').insert({ user_id: watcher.id, movie_id: ep.s1e2.id, position_seconds: 990 })
      expect((await getSeriesPage(show.slug))!.next).toMatchObject({ action: 'play', episode: { id: ep.s2e1.id }, startAt: 0 })
      const entries = (await getCatalog()).continueWatching.filter((c) => c.episode?.series.id === show.id)
      expect(entries).toHaveLength(1)
      expect(entries[0]).toMatchObject({ positionSeconds: 0, movie: { id: ep.s2e1.id }, episode: { season: 2, episode: 1 } })

      // Va a medias en T2:E1 → continuar; sigue habiendo una sola entrada de la serie
      await adminClient().from('watch_progress').insert({ user_id: watcher.id, movie_id: ep.s2e1.id, position_seconds: 400 })
      expect((await getSeriesPage(show.slug))!.next).toMatchObject({ action: 'continue', episode: { id: ep.s2e1.id }, startAt: 400 })
      const again = (await getCatalog()).continueWatching.filter((c) => c.episode?.series.id === show.id)
      expect(again).toHaveLength(1)
      expect(again[0]).toMatchObject({ positionSeconds: 400, movie: { id: ep.s2e1.id } })

      // Terminó el último → la serie sale de "Seguir viendo" y el botón es volver a ver T1:E1
      await adminClient().from('watch_progress').update({ position_seconds: 1000, updated_at: new Date().toISOString() }).eq('user_id', watcher.id).eq('movie_id', ep.s2e1.id)
      expect((await getSeriesPage(show.slug))!.next).toMatchObject({ action: 'rewatch', episode: { id: ep.s1e1.id } })
      expect((await getCatalog()).continueWatching.some((c) => c.episode?.series.id === show.id)).toBe(false)
    } finally {
      await deleteUsers([watcher.id])
    }
  })

  it('SER-12 ver un episodio trae su serie y el siguiente publicado (cruza temporada, salta borradores)', async () => {
    await as(viewer)
    const w = await getWatchable(ep.s1e2.slug)
    expect(w!.episode).toMatchObject({ series: { slug: show.slug }, next: { id: ep.s2e1.id } })
    expect((await getWatchable(ep.s2e1.slug))!.episode!.next).toBeNull()
    expect(await getWatchable(ep.hidden.slug)).toBeNull()

    // Una película no trae datos de serie
    const movie = await adminClient()
      .from('movies')
      .insert({ slug: `peli-w-${tag}`, title: 'Peli', duration_seconds: 10, hls_path: 'ladder/master.m3u8', status: 'published' })
      .select('slug')
      .single()
    expect((await getWatchable(movie.data!.slug))!.episode).toBeNull()
  })
})
