import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { adminClient, anonClient, createUser, deleteUsers, signedInClient, type TestUser } from '../helpers/users'

let ana: TestUser
let beto: TestUser
let boss: TestUser
let asAna: SupabaseClient
let asBeto: SupabaseClient
let asBoss: SupabaseClient
const tag = Math.random().toString(36).slice(2, 8)
const movies: Record<string, string> = {}
const series: Record<string, string> = {}

async function insertMovie(key: string, fields: Record<string, unknown> = {}) {
  const { data, error } = await adminClient()
    .from('movies')
    .insert({ slug: `pl-${key.toLowerCase()}-${tag}`, title: key, duration_seconds: 100, hls_path: 'movies/x/master.m3u8', status: 'published', ...fields })
    .select('id')
    .single()
  if (error) throw error
  movies[key] = data.id
}

async function insertSeries(key: string, status = 'published') {
  const { data, error } = await adminClient().from('series').insert({ slug: `pl-s-${key}-${tag}`, title: key, status }).select('id').single()
  if (error) throw error
  series[key] = data.id
}

async function listOf(client: SupabaseClient, name = 'Mi lista') {
  const { data, error } = await client.from('playlists').insert({ name }).select('id, user_id').single()
  if (error) throw error
  return data as { id: string; user_id: string }
}

beforeAll(async () => {
  ;[ana, beto, boss] = await Promise.all([createUser({ prefix: 'pl-ana' }), createUser({ prefix: 'pl-beto' }), createUser({ role: 'admin', prefix: 'pl-boss' })])
  ;[asAna, asBeto, asBoss] = await Promise.all([signedInClient(ana), signedInClient(beto), signedInClient(boss)])
  await insertMovie('pub')
  await insertMovie('otra')
  await insertMovie('draft', { status: 'draft' })
  await insertSeries('show')
  await insertSeries('hidden', 'draft')
  await insertMovie('epHidden', { series_id: series.hidden, season_number: 1, episode_number: 1 })
})

afterAll(async () => {
  await adminClient().from('series').delete().in('id', Object.values(series))
  await adminClient().from('movies').delete().in('id', Object.values(movies))
  await deleteUsers([ana.id, beto.id, boss.id])
})

describe('listas (PL-01)', () => {
  it('la lista es de quien la crea; no se puede crear a nombre de otro', async () => {
    const list = await listOf(asAna)
    expect(list.user_id).toBe(ana.id)
    const forged = await asAna.from('playlists').insert({ name: 'Falsa', user_id: beto.id })
    expect(forged.error).not.toBeNull()
  })

  it('nadie más la ve, la renombra ni la borra (ni un admin); un anónimo nada', async () => {
    const list = await listOf(asAna, 'Privada')
    for (const other of [asBeto, asBoss, anonClient()]) {
      expect((await other.from('playlists').select('id').eq('id', list.id)).data ?? []).toEqual([])
      expect((await other.from('playlists').update({ name: 'Hack' }).eq('id', list.id).select('id')).data ?? []).toEqual([])
      expect((await other.from('playlists').delete().eq('id', list.id).select('id')).data ?? []).toEqual([])
    }
    const { data } = await adminClient().from('playlists').select('name').eq('id', list.id).single()
    expect(data!.name).toBe('Privada')
  })

  it('el dueño la renombra y la borra', async () => {
    const list = await listOf(asAna)
    expect((await asAna.from('playlists').update({ name: 'Nueva' }).eq('id', list.id).select('name')).data?.[0].name).toBe('Nueva')
    expect((await asAna.from('playlists').delete().eq('id', list.id).select('id')).data).toHaveLength(1)
  })

  it('nombre de 1 a 100 caracteres sin espacios sobrantes', async () => {
    for (const name of ['', '   ', ' con espacios ', 'x'.repeat(101)]) {
      expect((await asAna.from('playlists').insert({ name })).error, JSON.stringify(name)).not.toBeNull()
    }
    expect((await asAna.from('playlists').insert({ name: 'x'.repeat(100) })).error).toBeNull()
  })
})

describe('elementos de la lista (PL-02)', () => {
  it('película o serie, nunca ambos ni ninguno; lo nuevo va al final', async () => {
    const list = await listOf(asAna)
    expect((await asAna.from('playlist_items').insert({ playlist_id: list.id })).error).not.toBeNull()
    expect((await asAna.from('playlist_items').insert({ playlist_id: list.id, movie_id: movies.pub, series_id: series.show })).error).not.toBeNull()

    await asAna.from('playlist_items').insert({ playlist_id: list.id, movie_id: movies.pub })
    await asAna.from('playlist_items').insert({ playlist_id: list.id, series_id: series.show })
    const { data } = await asAna.from('playlist_items').select('movie_id, series_id, position').eq('playlist_id', list.id).order('position')
    expect(data).toEqual([
      { movie_id: movies.pub, series_id: null, position: 1 },
      { movie_id: null, series_id: series.show, position: 2 },
    ])
  })

  it('no se repite lo mismo en una lista', async () => {
    const list = await listOf(asAna)
    await asAna.from('playlist_items').insert({ playlist_id: list.id, movie_id: movies.pub })
    expect((await asAna.from('playlist_items').insert({ playlist_id: list.id, movie_id: movies.pub })).error?.code).toBe('23505')
    await asAna.from('playlist_items').insert({ playlist_id: list.id, series_id: series.show })
    expect((await asAna.from('playlist_items').insert({ playlist_id: list.id, series_id: series.show })).error?.code).toBe('23505')
  })

  it('solo se agrega lo publicado (tampoco un admin agrega borradores)', async () => {
    const list = await listOf(asAna)
    for (const target of [{ movie_id: movies.draft }, { series_id: series.hidden }, { movie_id: movies.epHidden }]) {
      expect((await asAna.from('playlist_items').insert({ playlist_id: list.id, ...target })).error, JSON.stringify(target)).not.toBeNull()
    }
    const bossList = await listOf(asBoss)
    expect((await asBoss.from('playlist_items').insert({ playlist_id: bossList.id, movie_id: movies.draft })).error).not.toBeNull()
  })

  it('nadie más lee ni toca los elementos de mi lista, ni agrega a ella', async () => {
    const list = await listOf(asAna)
    const { data: item } = await asAna.from('playlist_items').insert({ playlist_id: list.id, movie_id: movies.pub }).select('id').single()
    for (const other of [asBeto, asBoss]) {
      expect((await other.from('playlist_items').select('id').eq('playlist_id', list.id)).data).toEqual([])
      expect((await other.from('playlist_items').insert({ playlist_id: list.id, movie_id: movies.otra })).error).not.toBeNull()
      expect((await other.from('playlist_items').update({ position: 99 }).eq('id', item!.id).select('id')).data).toEqual([])
      expect((await other.from('playlist_items').delete().eq('id', item!.id).select('id')).data).toEqual([])
    }
    expect((await anonClient().from('playlist_items').select('id').eq('playlist_id', list.id)).data ?? []).toEqual([])
  })

  it('el dueño reordena y quita', async () => {
    const list = await listOf(asAna)
    const { data: item } = await asAna.from('playlist_items').insert({ playlist_id: list.id, movie_id: movies.pub }).select('id').single()
    expect((await asAna.from('playlist_items').update({ position: 5 }).eq('id', item!.id).select('position')).data?.[0].position).toBe(5)
    expect((await asAna.from('playlist_items').delete().eq('id', item!.id).select('id')).data).toHaveLength(1)
  })

  it('borrar la lista borra sus elementos; borrar una película o serie la quita de las listas', async () => {
    await insertMovie('temp')
    await insertSeries('temp')
    const list = await listOf(asAna)
    await asAna.from('playlist_items').insert([{ playlist_id: list.id, movie_id: movies.temp }, { playlist_id: list.id, series_id: series.temp }, { playlist_id: list.id, movie_id: movies.pub }])

    await adminClient().from('movies').delete().eq('id', movies.temp)
    await adminClient().from('series').delete().eq('id', series.temp)
    const { data } = await adminClient().from('playlist_items').select('movie_id').eq('playlist_id', list.id)
    expect(data).toEqual([{ movie_id: movies.pub }])

    await asAna.from('playlists').delete().eq('id', list.id)
    expect((await adminClient().from('playlist_items').select('id').eq('playlist_id', list.id)).data).toEqual([])
  })
})
