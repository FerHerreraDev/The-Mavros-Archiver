import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { adminClient, anonClient, createUser, deleteUsers, signedInClient, type TestUser } from '../helpers/users'

let viewer: TestUser
let boss: TestUser
let asViewer: SupabaseClient
let asBoss: SupabaseClient
const createdSeries: string[] = []

const uniq = () => Math.random().toString(36).slice(2, 8)

async function insertSeries(overrides: Record<string, unknown> = {}) {
  const { data, error } = await adminClient()
    .from('series')
    .insert({ slug: `serie-${uniq()}`, title: 'Serie de prueba', ...overrides })
    .select('id')
    .single()
  if (error) throw error
  createdSeries.push(data.id)
  return data.id as string
}

async function insertEpisode(seriesId: string, season: number, episode: number, status = 'published') {
  const { data, error } = await adminClient()
    .from('movies')
    .insert({
      slug: `ep-${uniq()}`,
      title: `Episodio ${episode}`,
      duration_seconds: 100,
      hls_path: `series/x/s${season}e${episode}/master.m3u8`,
      series_id: seriesId,
      season_number: season,
      episode_number: episode,
      status,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

let publishedSeries: string
let draftSeries: string
let visibleEpisode: string
let draftEpisode: string
let episodeOfDraftSeries: string

beforeAll(async () => {
  ;[viewer, boss] = await Promise.all([createUser({ prefix: 'viewer' }), createUser({ role: 'admin', prefix: 'boss' })])
  ;[asViewer, asBoss] = await Promise.all([signedInClient(viewer), signedInClient(boss)])
  publishedSeries = await insertSeries({ status: 'published' })
  draftSeries = await insertSeries({ status: 'draft' })
  visibleEpisode = await insertEpisode(publishedSeries, 1, 1)
  draftEpisode = await insertEpisode(publishedSeries, 1, 2, 'draft')
  episodeOfDraftSeries = await insertEpisode(draftSeries, 1, 1)
})

afterAll(async () => {
  await adminClient().from('series').delete().in('id', createdSeries)
  await deleteUsers([viewer.id, boss.id])
})

describe('series: lectura (SER-01)', () => {
  it('un usuario ve solo las publicadas', async () => {
    const { data } = await asViewer.from('series').select('id').in('id', [publishedSeries, draftSeries])
    expect(data?.map((s) => s.id)).toEqual([publishedSeries])
  })

  it('un admin ve también borradores', async () => {
    const { data } = await asBoss.from('series').select('id').in('id', [publishedSeries, draftSeries])
    expect(data?.map((s) => s.id).sort()).toEqual([publishedSeries, draftSeries].sort())
  })

  it('un anónimo no ve ninguna', async () => {
    const { data } = await anonClient().from('series').select('id').in('id', [publishedSeries, draftSeries])
    expect(data ?? []).toEqual([])
  })
})

describe('series: escritura (SER-01)', () => {
  it('un usuario no puede crear, editar ni borrar', async () => {
    const insert = await asViewer.from('series').insert({ slug: `x-${uniq()}`, title: 'Hack' })
    expect(insert.error).not.toBeNull()

    const update = await asViewer.from('series').update({ title: 'Hack' }).eq('id', publishedSeries).select('id')
    expect(update.data ?? []).toEqual([])

    const del = await asViewer.from('series').delete().eq('id', publishedSeries).select('id')
    expect(del.data ?? []).toEqual([])

    const { data } = await adminClient().from('series').select('title').eq('id', publishedSeries).single()
    expect(data!.title).toBe('Serie de prueba')
  })

  it('un anónimo no puede crear', async () => {
    const { error } = await anonClient().from('series').insert({ slug: `x-${uniq()}`, title: 'Hack' })
    expect(error).not.toBeNull()
  })

  it('un admin crea, edita y borra con su sesión', async () => {
    const slug = `admin-${uniq()}`
    const created = await asBoss.from('series').insert({ slug, title: 'Nueva' }).select('id, created_by, status').single()
    expect(created.error).toBeNull()
    expect(created.data!.created_by).toBe(boss.id)
    expect(created.data!.status).toBe('draft')

    const updated = await asBoss.from('series').update({ title: 'Editada' }).eq('id', created.data!.id).select('title')
    expect(updated.data?.[0].title).toBe('Editada')

    const deleted = await asBoss.from('series').delete().eq('id', created.data!.id).select('id')
    expect(deleted.data?.length).toBe(1)
  })
})

describe('series: integridad (SER-02)', () => {
  const bad: [string, Record<string, unknown>][] = [
    ['slug con mayúsculas', { slug: 'Mala-Serie' }],
    ['título vacío', { title: '   ' }],
    ['año fuera de rango', { release_year: 1700 }],
    ['póster http', { poster_url: 'http://x.com/a.jpg' }],
    ['estado inválido', { status: 'archived' }],
  ]
  for (const [name, overrides] of bad) {
    it(`rechaza ${name}`, async () => {
      const { error } = await adminClient().from('series').insert({ slug: `ok-${uniq()}`, title: 'Ok', ...overrides })
      expect(error).not.toBeNull()
    })
  }

  it('slug único', async () => {
    const slug = `unico-${uniq()}`
    await insertSeries({ slug })
    const { error } = await adminClient().from('series').insert({ slug, title: 'Otra' })
    expect(error?.code).toBe('23505')
  })

  it('published_at se fija al publicar y se borra al volver a borrador; updated_at avanza', async () => {
    const id = await insertSeries()
    const before = await adminClient().from('series').select('published_at, updated_at').eq('id', id).single()
    expect(before.data!.published_at).toBeNull()

    await new Promise((r) => setTimeout(r, 20))
    const published = await asBoss.from('series').update({ status: 'published' }).eq('id', id).select('published_at, updated_at').single()
    expect(published.data!.published_at).not.toBeNull()
    expect(Date.parse(published.data!.updated_at)).toBeGreaterThan(Date.parse(before.data!.updated_at))

    const draft = await asBoss.from('series').update({ status: 'draft' }).eq('id', id).select('published_at').single()
    expect(draft.data!.published_at).toBeNull()
  })
})

describe('episodios: integridad (SER-03)', () => {
  const episode = (overrides: Record<string, unknown>) => ({
    slug: `ep-${uniq()}`,
    title: 'Ep',
    duration_seconds: 10,
    hls_path: 'series/x/e/master.m3u8',
    ...overrides,
  })

  it('serie, temporada y episodio van juntos o ninguno', async () => {
    const onlySeries = await adminClient().from('movies').insert(episode({ series_id: publishedSeries }))
    expect(onlySeries.error).not.toBeNull()
    const onlySeason = await adminClient().from('movies').insert(episode({ season_number: 1, episode_number: 1 }))
    expect(onlySeason.error).not.toBeNull()
  })

  it('temporada 0–999 y episodio 1–9999', async () => {
    for (const [season, number] of [[-1, 1], [1000, 1], [1, 0], [1, 10000]]) {
      const { error } = await adminClient()
        .from('movies')
        .insert(episode({ series_id: publishedSeries, season_number: season, episode_number: number }))
      expect(error, `T${season}E${number}`).not.toBeNull()
    }
    const special = await adminClient()
      .from('movies')
      .insert(episode({ series_id: publishedSeries, season_number: 0, episode_number: 1 }))
      .select('id')
    expect(special.error).toBeNull()
  })

  it('no se repite temporada + episodio en la misma serie (sí en otra)', async () => {
    const dup = await adminClient().from('movies').insert(episode({ series_id: publishedSeries, season_number: 1, episode_number: 1 }))
    expect(dup.error?.code).toBe('23505')
    const other = await adminClient().from('movies').insert(episode({ series_id: draftSeries, season_number: 1, episode_number: 2 }))
    expect(other.error).toBeNull()
  })

  it('borrar la serie borra sus episodios y el progreso de ellos', async () => {
    const id = await insertSeries({ status: 'published' })
    const ep = await insertEpisode(id, 1, 1)
    const saved = await asViewer.from('watch_progress').insert({ movie_id: ep, position_seconds: 30 })
    expect(saved.error).toBeNull()

    await asBoss.from('series').delete().eq('id', id)
    const movies = await adminClient().from('movies').select('id').eq('id', ep)
    expect(movies.data).toEqual([])
    const progress = await adminClient().from('watch_progress').select('movie_id').eq('movie_id', ep)
    expect(progress.data).toEqual([])
  })
})

describe('episodios: visibilidad (SER-04)', () => {
  it('un usuario ve el episodio publicado de una serie publicada', async () => {
    const { data } = await asViewer.from('movies').select('id').eq('series_id', publishedSeries)
    expect(data?.map((m) => m.id)).toEqual([visibleEpisode])
  })

  it('un usuario no ve episodios en borrador ni de series en borrador (por id ni listando)', async () => {
    for (const id of [draftEpisode, episodeOfDraftSeries]) {
      const { data } = await asViewer.from('movies').select('id').eq('id', id)
      expect(data).toEqual([])
    }
    const { data } = await asViewer.from('movies').select('id').eq('series_id', draftSeries)
    expect(data).toEqual([])
  })

  it('un admin ve todos', async () => {
    const { data } = await asBoss.from('movies').select('id').in('id', [visibleEpisode, draftEpisode, episodeOfDraftSeries])
    expect(data?.length).toBe(3)
  })

  it('un usuario no puede guardar progreso de un episodio de una serie en borrador', async () => {
    const { error } = await asViewer.from('watch_progress').insert({ movie_id: episodeOfDraftSeries, position_seconds: 5 })
    expect(error).not.toBeNull()
  })

  it('al despublicar la serie, su episodio deja de verse', async () => {
    const id = await insertSeries({ status: 'published' })
    const ep = await insertEpisode(id, 1, 1)
    expect((await asViewer.from('movies').select('id').eq('id', ep)).data?.length).toBe(1)
    await asBoss.from('series').update({ status: 'draft' }).eq('id', id)
    expect((await asViewer.from('movies').select('id').eq('id', ep)).data).toEqual([])
  })
})
