import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { anonClient, createUser, deleteUsers, signedInClient, type TestUser } from '../helpers/users'

// REQ-01, REQ-02: pedidos propios; los admins ven todos y cambian el estado
let ana: TestUser
let beto: TestUser
let boss: TestUser
let asAna: SupabaseClient
let asBeto: SupabaseClient
let asBoss: SupabaseClient

beforeAll(async () => {
  ;[ana, beto, boss] = await Promise.all([createUser({ prefix: 'req-ana' }), createUser({ prefix: 'req-beto' }), createUser({ role: 'admin', prefix: 'req-boss' })])
  ;[asAna, asBeto, asBoss] = await Promise.all([signedInClient(ana), signedInClient(beto), signedInClient(boss)])
})
afterAll(async () => {
  await deleteUsers([ana.id, beto.id, boss.id])
})

async function request(client: SupabaseClient, title: string, note?: string) {
  const { data, error } = await client.from('movie_requests').insert({ title, note }).select('id, user_id, status').single()
  if (error) throw error
  return data as { id: string; user_id: string; status: string }
}

describe('pedidos (REQ-01)', () => {
  it('el pedido es de quien lo crea, empieza pendiente y no se puede crear a nombre de otro ni ya resuelto', async () => {
    const mine = await request(asAna, 'Dune', 'La de 2021')
    expect(mine).toMatchObject({ user_id: ana.id, status: 'pending' })
    expect((await asAna.from('movie_requests').insert({ title: 'Falsa', user_id: beto.id })).error).not.toBeNull()
    expect((await asAna.from('movie_requests').insert({ title: 'Ya está', status: 'added' })).error).not.toBeNull()
  })

  it('cada usuario ve solo los suyos; un admin ve todos; un anónimo nada', async () => {
    const mine = await request(asAna, 'Alien')
    expect((await asBeto.from('movie_requests').select('id').eq('id', mine.id)).data).toEqual([])
    expect((await anonClient().from('movie_requests').select('id').eq('id', mine.id)).data ?? []).toEqual([])
    expect((await anonClient().from('movie_requests').insert({ title: 'Anon' })).error).not.toBeNull()
    expect((await asBoss.from('movie_requests').select('id').eq('id', mine.id)).data).toEqual([{ id: mine.id }])
  })

  it('un usuario no cambia el estado ni el título; un admin cambia el estado y se anota cuándo', async () => {
    const mine = await request(asAna, 'Heat')
    expect((await asAna.from('movie_requests').update({ status: 'added' }).eq('id', mine.id).select('id')).data ?? []).toEqual([])
    expect((await asBoss.from('movie_requests').update({ title: 'Otra' }).eq('id', mine.id)).error).not.toBeNull()

    const { data, error } = await asBoss.from('movie_requests').update({ status: 'added' }).eq('id', mine.id).select('status, resolved_at').single()
    expect(error).toBeNull()
    expect(data!.status).toBe('added')
    expect(data!.resolved_at).not.toBeNull()
    expect((await asBoss.from('movie_requests').update({ status: 'otro' }).eq('id', mine.id)).error).not.toBeNull()
  })

  it('se borran solo los propios pendientes', async () => {
    const pending = await request(asAna, 'Borrable')
    const done = await request(asAna, 'Resuelto')
    await asBoss.from('movie_requests').update({ status: 'rejected' }).eq('id', done.id)

    expect((await asBeto.from('movie_requests').delete().eq('id', pending.id).select('id')).data ?? []).toEqual([])
    expect((await asAna.from('movie_requests').delete().eq('id', done.id).select('id')).data ?? []).toEqual([])
    expect((await asAna.from('movie_requests').delete().eq('id', pending.id).select('id')).data).toEqual([{ id: pending.id }])
  })

  it('título de 1 a 200 caracteres sin espacios sobrantes, nota de hasta 500', async () => {
    for (const bad of [{ title: '' }, { title: '  Espacios ' }, { title: 'x'.repeat(201) }, { title: 'Nota larga', note: 'n'.repeat(501) }]) {
      expect((await asBeto.from('movie_requests').insert(bad)).error, JSON.stringify(bad).slice(0, 40)).not.toBeNull()
    }
  })
})

describe('límites (REQ-02)', () => {
  it('el mismo título pendiente dos veces no (sin importar mayúsculas ni espacios); otro usuario sí puede', async () => {
    await request(asBeto, 'El Padrino')
    expect((await asBeto.from('movie_requests').insert({ title: 'el  padrino' })).error).not.toBeNull()
    await expect(request(asAna, 'El Padrino')).resolves.toMatchObject({ status: 'pending' })
  })

  it('un título ya resuelto se puede volver a pedir', async () => {
    const first = await request(asBeto, 'Matrix')
    await asBoss.from('movie_requests').update({ status: 'rejected' }).eq('id', first.id)
    await expect(request(asBeto, 'Matrix')).resolves.toMatchObject({ status: 'pending' })
  })

  it('a lo más 20 pendientes por usuario', async () => {
    const carla = await createUser({ prefix: 'req-carla' })
    try {
      const asCarla = await signedInClient(carla)
      const rows = Array.from({ length: 20 }, (_, i) => ({ title: `Película ${i}` }))
      expect((await asCarla.from('movie_requests').insert(rows)).error).toBeNull()
      const over = await asCarla.from('movie_requests').insert({ title: 'La 21' })
      expect(over.error?.message).toMatch(/too_many_requests/)
    } finally {
      await deleteUsers([carla.id])
    }
  })
})
