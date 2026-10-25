import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { adminClient, anonClient, createUser, deleteUsers, signedInClient, type TestUser } from '../helpers/users'

let alice: TestUser
let bob: TestUser
let boss: TestUser
let asAlice: SupabaseClient
let asBob: SupabaseClient
let asBoss: SupabaseClient
let published: string
let draft: string

const uniq = () => Math.random().toString(36).slice(2, 8)

async function insertMovie(status: 'draft' | 'published') {
  const slug = `prg-${status}-${uniq()}`
  const { data, error } = await adminClient()
    .from('movies')
    .insert({ slug, title: slug, duration_seconds: 100, hls_path: `movies/${slug}/master.m3u8`, status })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

const rowsFor = async (userId: string, movieId: string) =>
  (await adminClient().from('watch_progress').select('position_seconds').eq('user_id', userId).eq('movie_id', movieId)).data ?? []

beforeAll(async () => {
  ;[alice, bob, boss] = await Promise.all([
    createUser({ prefix: 'prg-alice' }),
    createUser({ prefix: 'prg-bob' }),
    createUser({ role: 'admin', prefix: 'prg-boss' }),
  ])
  ;[asAlice, asBob, asBoss] = await Promise.all([signedInClient(alice), signedInClient(bob), signedInClient(boss)])
  published = await insertMovie('published')
  draft = await insertMovie('draft')
})

afterAll(async () => {
  await adminClient().from('movies').delete().in('id', [published, draft])
  await deleteUsers([alice.id, bob.id, boss.id])
})

const upsert = (client: SupabaseClient, row: Record<string, unknown>) =>
  client.from('watch_progress').upsert(row, { onConflict: 'user_id,movie_id' })

describe('PRG-03 cada quien lo suyo', () => {
  it('un usuario guarda y lee su propio progreso (user_id lo pone la base)', async () => {
    const { error } = await upsert(asAlice, { movie_id: published, position_seconds: 42.5 })
    expect(error).toBeNull()
    const { data } = await asAlice.from('watch_progress').select('user_id, position_seconds').eq('movie_id', published)
    expect(data).toEqual([{ user_id: alice.id, position_seconds: 42.5 }])
  })

  it('otro usuario no ve el progreso ajeno', async () => {
    await upsert(asAlice, { movie_id: published, position_seconds: 50 })
    const { data } = await asBob.from('watch_progress').select('user_id').eq('user_id', alice.id)
    expect(data).toEqual([])
  })

  it('ni un admin ve el progreso ajeno desde el cliente', async () => {
    const { data } = await asBoss.from('watch_progress').select('user_id').eq('user_id', alice.id)
    expect(data).toEqual([])
  })

  it('no se puede escribir a nombre de otro', async () => {
    const { error } = await upsert(asBob, { user_id: alice.id, movie_id: published, position_seconds: 99 })
    expect(error).not.toBeNull()
    expect((await rowsFor(alice.id, published))[0]?.position_seconds).not.toBe(99)
  })

  it('no se puede editar ni borrar el progreso de otro', async () => {
    await upsert(asAlice, { movie_id: published, position_seconds: 30 })
    await asBob.from('watch_progress').update({ position_seconds: 1 }).eq('user_id', alice.id)
    await asBob.from('watch_progress').delete().eq('user_id', alice.id)
    expect(await rowsFor(alice.id, published)).toEqual([{ position_seconds: 30 }])
  })

  it('un anónimo no lee ni escribe', async () => {
    const read = await anonClient().from('watch_progress').select('user_id')
    expect(read.data ?? []).toEqual([])
    const write = await upsert(anonClient(), { movie_id: published, position_seconds: 5 })
    expect(write.error).not.toBeNull()
  })
})

describe('PRG-04 solo películas visibles y posiciones válidas', () => {
  it('un user no puede guardar progreso de un borrador', async () => {
    const { error } = await upsert(asAlice, { movie_id: draft, position_seconds: 10 })
    expect(error).not.toBeNull()
    expect(await rowsFor(alice.id, draft)).toEqual([])
  })

  it('un admin sí (vista previa de borradores)', async () => {
    const { error } = await upsert(asBoss, { movie_id: draft, position_seconds: 10 })
    expect(error).toBeNull()
  })

  it('posición negativa → error', async () => {
    const { error } = await upsert(asAlice, { movie_id: published, position_seconds: -1 })
    expect(error).not.toBeNull()
  })

  it('posición mayor que la duración (+1 s de tolerancia) → error', async () => {
    expect((await upsert(asAlice, { movie_id: published, position_seconds: 101 })).error).toBeNull()
    expect((await upsert(asAlice, { movie_id: published, position_seconds: 101.5 })).error).not.toBeNull()
  })
})

describe('PRG-05 un registro por usuario y película; cascadas', () => {
  it('guardar dos veces actualiza el mismo registro', async () => {
    await upsert(asBob, { movie_id: published, position_seconds: 10 })
    await upsert(asBob, { movie_id: published, position_seconds: 20 })
    expect(await rowsFor(bob.id, published)).toEqual([{ position_seconds: 20 }])
  })

  it('updated_at lo pone la base, no el cliente', async () => {
    await upsert(asBob, { movie_id: published, position_seconds: 25, updated_at: '2000-01-01T00:00:00Z' })
    const { data } = await adminClient().from('watch_progress').select('updated_at').eq('user_id', bob.id).eq('movie_id', published).single()
    expect(new Date(data!.updated_at).getFullYear()).toBeGreaterThan(2000)
  })

  it('borrar la película borra su progreso', async () => {
    const temp = await insertMovie('published')
    await upsert(asBob, { movie_id: temp, position_seconds: 5 })
    await adminClient().from('movies').delete().eq('id', temp)
    expect(await rowsFor(bob.id, temp)).toEqual([])
  })

  it('borrar al usuario borra su progreso', async () => {
    const temp = await createUser({ prefix: 'prg-temp' })
    await upsert(await signedInClient(temp), { movie_id: published, position_seconds: 5 })
    await deleteUsers([temp.id])
    expect(await rowsFor(temp.id, published)).toEqual([])
  })
})
