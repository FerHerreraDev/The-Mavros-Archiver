import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createHash } from 'node:crypto'
import { adminClient, anonClient, createUser, deleteUsers, signedInClient, type TestUser } from '../helpers/users'

let user: TestUser
const deviceCode = 'db-test-device-code-0123456789abcdefghijklmn'
const hash = createHash('sha256').update(deviceCode).digest('hex')

beforeAll(async () => {
  user = await createUser({ prefix: 'dev-rls' })
  await adminClient().from('device_codes').insert({
    device_code_hash: hash,
    user_code: 'ZZZZ2345',
    expires_at: new Date(Date.now() + 600_000).toISOString(),
  })
})
afterAll(async () => {
  await adminClient().from('device_codes').delete().eq('device_code_hash', hash)
  await deleteUsers([user.id])
})

describe('DEV-07 los clientes no tocan los códigos', () => {
  it('anónimo y usuario no pueden leer', async () => {
    for (const client of [anonClient(), await signedInClient(user)]) {
      const { data } = await client.from('device_codes').select('user_code')
      expect(data ?? []).toEqual([])
    }
  })

  it('un usuario no puede aprobarse un código directamente (update) ni insertar', async () => {
    const client = await signedInClient(user)
    await client.from('device_codes').update({ status: 'approved', user_id: user.id }).eq('device_code_hash', hash)
    const { data } = await adminClient().from('device_codes').select('status').eq('device_code_hash', hash).single()
    expect(data?.status).toBe('pending')

    const insert = await client.from('device_codes').insert({ device_code_hash: 'x', user_code: 'AAAA2345', expires_at: new Date().toISOString() })
    expect(insert.error).not.toBeNull()
  })

  it('nadie más que el servidor puede llamar device_code_poll', async () => {
    for (const client of [anonClient(), await signedInClient(user)]) {
      const { error } = await client.rpc('device_code_poll', { p_hash: hash, p_min_interval_seconds: 0 })
      expect(error).not.toBeNull()
    }
  })

  it('la base guarda el hash, no el device_code', async () => {
    const { data } = await adminClient().from('device_codes').select('*').eq('device_code_hash', hash).single()
    expect(JSON.stringify(data)).not.toContain(deviceCode)
  })
})

describe('integridad', () => {
  it.each(['K0Q4MX2P', 'short', 'K7Q4-MX2']) ('user_code con formato inválido %j → error', async (userCode) => {
    const { error } = await adminClient().from('device_codes').insert({
      device_code_hash: `h-${userCode}`,
      user_code: userCode,
      expires_at: new Date(Date.now() + 1000).toISOString(),
    })
    expect(error).not.toBeNull()
  })

  it('no puede haber dos códigos vivos con el mismo user_code', async () => {
    const { error } = await adminClient().from('device_codes').insert({
      device_code_hash: 'another-hash',
      user_code: 'ZZZZ2345',
      expires_at: new Date(Date.now() + 1000).toISOString(),
    })
    expect(error?.code).toBe('23505')
  })

  it('un código aprobado tiene usuario; uno pendiente no', async () => {
    const pendingWithUser = await adminClient().from('device_codes').update({ user_id: user.id }).eq('device_code_hash', hash)
    expect(pendingWithUser.error).not.toBeNull()
  })
})
