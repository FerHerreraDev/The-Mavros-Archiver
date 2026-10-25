import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { getCatalog, getWatchable } from '@/lib/data/catalog'
import { resetRequest } from '../helpers/request-context'
import { adminClient, createUser, deleteUsers, sessionCookies, type TestUser } from '../helpers/users'

// Otras pruebas crean películas en paralelo: aquí solo se comprueban las propias (por id), nunca totales
let viewer: TestUser
let boss: TestUser
const tag = Math.random().toString(36).slice(2, 8)
const genre = `genero-${tag}`
const ids: Record<string, string> = {}

async function insert(key: string, fields: Record<string, unknown>) {
  const slug = `cat-${key}-${tag}`
  const { data, error } = await adminClient()
    .from('movies')
    .insert({ slug, title: `Cat ${key}`, duration_seconds: 1000, hls_path: `movies/${slug}/master.m3u8`, ...fields })
    .select('id')
    .single()
  if (error) throw error
  ids[key] = data.id
}

beforeAll(async () => {
  ;[viewer, boss] = await Promise.all([createUser({ prefix: 'cat-viewer' }), createUser({ role: 'admin', prefix: 'cat-boss' })])
  await insert('old', { status: 'published', genres: [genre] })
  await insert('new', { status: 'published', genres: [genre, 'otro'] })
  await insert('nogenre', { status: 'published', genres: [] })
  await insert('draft', { status: 'draft', genres: [genre] })
  // Fechas de publicación controladas para probar el orden
  await adminClient().from('movies').update({ published_at: '2026-01-01T00:00:00Z' }).eq('id', ids.old)
  await adminClient().from('movies').update({ published_at: '2026-06-01T00:00:00Z' }).eq('id', ids.new)
})

afterAll(async () => {
  await adminClient().from('movies').delete().in('id', Object.values(ids))
  await deleteUsers([viewer.id, boss.id])
})

async function as(user: TestUser) {
  resetRequest({ cookies: await sessionCookies(user) })
}

const position = (list: { id: string }[], id: string) => list.findIndex((m) => m.id === id)

describe('getCatalog', () => {
  it('CAT-01 solo publicadas, también para un admin', async () => {
    for (const user of [viewer, boss]) {
      await as(user)
      const { recent } = await getCatalog()
      expect(position(recent, ids.new)).toBeGreaterThanOrEqual(0)
      expect(position(recent, ids.draft)).toBe(-1)
    }
  })

  it('CAT-02 la publicada más recientemente va antes', async () => {
    await as(viewer)
    const { recent } = await getCatalog()
    expect(position(recent, ids.new)).toBeLessThan(position(recent, ids.old))
  })

  it('CAT-04 los géneros salen de las publicadas; filtrar deja solo las de ese género', async () => {
    await as(viewer)
    const { genres } = await getCatalog()
    expect(genres).toContain(genre)

    const { recent } = await getCatalog(genre)
    expect(recent.every((m) => m.genres.includes(genre))).toBe(true)
    expect(recent.map((m) => m.id).sort()).toEqual([ids.new, ids.old].sort())
  })

  it('CAT-04 un género que no existe → lista vacía', async () => {
    await as(viewer)
    expect((await getCatalog(`no-existe-${tag}`)).recent).toEqual([])
  })

  it('CAT-06 "Seguir viendo": solo entre 5 % y 95 %, la más reciente primero, sin borradores', async () => {
    const watcher = await createUser({ prefix: 'cat-watcher' })
    const rows = [
      { movie_id: ids.old, position_seconds: 500 }, // 50 %
      { movie_id: ids.nogenre, position_seconds: 960 }, // 96 % → terminada
      { movie_id: ids.new, position_seconds: 100 }, // 10 %
    ]
    for (const row of rows) {
      await adminClient().from('watch_progress').insert({ ...row, user_id: watcher.id })
      await new Promise((r) => setTimeout(r, 20))
    }
    await as(watcher)
    const { continueWatching } = await getCatalog()
    expect(continueWatching.map((c) => c.movie.id)).toEqual([ids.new, ids.old])
    expect(continueWatching[0].positionSeconds).toBe(100)

    // Otro usuario no ve el progreso de este
    await as(viewer)
    expect((await getCatalog()).continueWatching.some((c) => c.movie.id === ids.old)).toBe(false)
    await deleteUsers([watcher.id])
  })
})

describe('getWatchable (WATCH-01)', () => {
  it('publicada → película y progreso del usuario', async () => {
    await as(viewer)
    const w = await getWatchable(`cat-new-${tag}`)
    expect(w?.movie.id).toBe(ids.new)
    expect(w?.positionSeconds).toBeNull()
  })

  it('borrador: un user no la obtiene; un admin sí (vista previa)', async () => {
    await as(viewer)
    expect(await getWatchable(`cat-draft-${tag}`)).toBeNull()
    await as(boss)
    expect((await getWatchable(`cat-draft-${tag}`))?.movie.id).toBe(ids.draft)
  })

  it('slug inexistente → null', async () => {
    await as(viewer)
    expect(await getWatchable(`no-existe-${tag}`)).toBeNull()
  })
})
