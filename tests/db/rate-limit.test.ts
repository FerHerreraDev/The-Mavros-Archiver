import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { limitWith, ratelimit } from '@/lib/rate-limit'
import { adminClient, anonClient, createUser, deleteUsers, signedInClient, type TestUser } from '../helpers/users'

const key = (name: string) => `test:${name}:${Math.random().toString(36).slice(2, 10)}`

let user: TestUser
beforeAll(async () => {
  user = await createUser({ prefix: 'rl' })
})
afterAll(async () => {
  await adminClient().from('rate_limits').delete().like('key', 'test:%')
  await deleteUsers([user.id])
})

describe('rate limit en Postgres', () => {
  it('OPS-01 permite 5 por minuto y bloquea el 6º', async () => {
    const k = key('seq')
    const results = []
    for (let i = 0; i < 6; i++) results.push((await ratelimit.limit(k)).success)
    expect(results).toEqual([true, true, true, true, true, false])
  })

  it('OPS-01 claves distintas no se afectan', async () => {
    const a = key('a')
    for (let i = 0; i < 6; i++) await ratelimit.limit(a)
    expect((await ratelimit.limit(key('b'))).success).toBe(true)
  })

  it('OPS-01 se comparte entre "instancias": dos clientes contra la misma base cuentan juntos', async () => {
    // Cada llamada crea su propio cliente admin, como haría otra instancia de la app
    const k = key('shared')
    const first = await Promise.all([0, 1, 2].map(() => ratelimit.limit(k)))
    const second = await Promise.all([0, 1, 2].map(() => ratelimit.limit(k)))
    expect([...first, ...second].filter((r) => r.success)).toHaveLength(5)
  })

  it('OPS-02 atómico: 30 intentos simultáneos → exactamente 5 pasan', async () => {
    const k = key('burst')
    const results = await Promise.all(Array.from({ length: 30 }, () => ratelimit.limit(k)))
    expect(results.filter((r) => r.success)).toHaveLength(5)
  })

  it('OPS-01 al vencer la ventana vuelve a permitir', async () => {
    const k = key('window')
    for (let i = 0; i < 3; i++) await limitWith(k, 2, 1)
    expect((await limitWith(k, 2, 1)).success).toBe(false)
    await new Promise((r) => setTimeout(r, 1100))
    expect((await limitWith(k, 2, 1)).success).toBe(true)
  })

  it('remaining baja hasta 0', async () => {
    const k = key('remaining')
    const remaining = []
    for (let i = 0; i < 6; i++) remaining.push((await ratelimit.limit(k)).remaining)
    expect(remaining).toEqual([4, 3, 2, 1, 0, 0])
  })
})

describe('OPS-03 solo el servidor', () => {
  it('anónimo no puede llamar la función ni leer la tabla', async () => {
    const call = await anonClient().rpc('rate_limit_hit', { p_key: key('anon'), p_max: 1000, p_window_seconds: 60 })
    expect(call.error).not.toBeNull()
    const read = await anonClient().from('rate_limits').select('key')
    expect(read.data ?? []).toEqual([])
  })

  it('un usuario autenticado tampoco (no puede reiniciar su contador)', async () => {
    const client = await signedInClient(user)
    const k = key('user')
    for (let i = 0; i < 6; i++) await ratelimit.limit(k)

    expect((await client.rpc('rate_limit_hit', { p_key: k, p_max: 1000, p_window_seconds: 60 })).error).not.toBeNull()
    await client.from('rate_limits').delete().eq('key', k)
    await client.from('rate_limits').update({ count: 0 }).eq('key', k)
    expect((await client.from('rate_limits').select('key')).data ?? []).toEqual([])

    expect((await ratelimit.limit(k)).success).toBe(false)
  })
})
