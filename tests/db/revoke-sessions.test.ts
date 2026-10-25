import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { adminClient, anonClient, createUser, deleteUsers, signedInClient, type TestUser } from '../helpers/users'

let victim: TestUser
let boss: TestUser

beforeAll(async () => {
  ;[victim, boss] = await Promise.all([createUser({ prefix: 'victim' }), createUser({ role: 'admin', prefix: 'boss' })])
})
afterAll(() => deleteUsers([victim.id, boss.id]))

async function victimStillLoggedIn(client: Awaited<ReturnType<typeof signedInClient>>) {
  const { data, error } = await client.auth.getUser()
  return !error && data.user?.id === victim.id
}

describe('DB-10 revoke_user_sessions solo desde el servidor', () => {
  it('un visitante anónimo no puede ejecutarla', async () => {
    const session = await signedInClient(victim)
    const { error } = await anonClient().rpc('revoke_user_sessions', { target_user_id: victim.id })
    expect(error).not.toBeNull()
    expect(await victimStillLoggedIn(session)).toBe(true)
  })

  it('un usuario autenticado, aunque sea admin, no puede ejecutarla', async () => {
    const session = await signedInClient(victim)
    const asBoss = await signedInClient(boss)
    const { error } = await asBoss.rpc('revoke_user_sessions', { target_user_id: victim.id })
    expect(error).not.toBeNull()
    expect(await victimStillLoggedIn(session)).toBe(true)
  })

  it('el service role sí, y la sesión deja de servir', async () => {
    const session = await signedInClient(victim)
    const { error } = await adminClient().rpc('revoke_user_sessions', { target_user_id: victim.id })
    expect(error).toBeNull()
    expect(await victimStillLoggedIn(session)).toBe(false)
  })
})
