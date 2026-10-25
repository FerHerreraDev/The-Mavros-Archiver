import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { adminClient, anonClient, createUser, deleteUsers, signedInClient, strongPassword, uniqueEmail, findUserByEmail, type TestUser } from '../helpers/users'

let alice: TestUser
let bob: TestUser
let boss: TestUser
let asAlice: SupabaseClient
let asBoss: SupabaseClient

beforeAll(async () => {
  ;[alice, bob, boss] = await Promise.all([
    createUser({ prefix: 'alice' }),
    createUser({ prefix: 'bob' }),
    createUser({ role: 'admin', prefix: 'boss' }),
  ])
  ;[asAlice, asBoss] = await Promise.all([signedInClient(alice), signedInClient(boss)])
})

afterAll(async () => {
  await deleteUsers([alice.id, bob.id, boss.id])
})

async function roleOf(id: string) {
  const { data } = await adminClient().from('profiles').select('role').eq('id', id).single()
  return data?.role
}

describe('profiles: lectura', () => {
  it('DB-01 un usuario lee su propio perfil', async () => {
    const { data, error } = await asAlice.from('profiles').select('id, role').eq('id', alice.id).single()
    expect(error).toBeNull()
    expect(data).toEqual({ id: alice.id, role: 'user' })
  })

  it('DB-02 un usuario NO ve perfiles ajenos (ni filtrando por id ni listando)', async () => {
    const byId = await asAlice.from('profiles').select('id').eq('id', bob.id)
    expect(byId.data).toEqual([])

    const all = await asAlice.from('profiles').select('id')
    expect(all.data?.map((p) => p.id)).toEqual([alice.id])
  })

  it('DB-03 un admin lee todos los perfiles', async () => {
    const { data } = await asBoss.from('profiles').select('id').in('id', [alice.id, bob.id, boss.id])
    expect(data?.map((p) => p.id).sort()).toEqual([alice.id, bob.id, boss.id].sort())
  })

  it('DB-06 un visitante anónimo no lee ningún perfil', async () => {
    const { data } = await anonClient().from('profiles').select('id').in('id', [alice.id, bob.id, boss.id])
    expect(data ?? []).toEqual([])
  })
})

describe('profiles: escritura desde el cliente', () => {
  it('DB-04 un usuario NO puede hacerse admin', async () => {
    await asAlice.from('profiles').update({ role: 'admin' }).eq('id', alice.id)
    expect(await roleOf(alice.id)).toBe('user')
  })

  it('DB-04 un usuario NO puede cambiar el email de su perfil', async () => {
    await asAlice.from('profiles').update({ email: 'hijack@example.com' }).eq('id', alice.id)
    const { data } = await adminClient().from('profiles').select('email').eq('id', alice.id).single()
    expect(data?.email).toBe(alice.email)
  })

  it('DB-04 un usuario NO puede cambiar el perfil de otro', async () => {
    await asAlice.from('profiles').update({ role: 'admin' }).eq('id', bob.id)
    expect(await roleOf(bob.id)).toBe('user')
  })

  it('DB-04 tampoco vía upsert', async () => {
    await asAlice.from('profiles').upsert({ id: alice.id, role: 'admin' })
    expect(await roleOf(alice.id)).toBe('user')
  })

  it('DB-05 un usuario NO puede insertar perfiles', async () => {
    const { error } = await asAlice.from('profiles').insert({ id: crypto.randomUUID(), role: 'admin' })
    expect(error).not.toBeNull()
  })

  it('DB-05 un usuario NO puede borrar perfiles (ni el suyo ni ajenos)', async () => {
    await asAlice.from('profiles').delete().eq('id', alice.id)
    await asAlice.from('profiles').delete().eq('id', bob.id)
    expect(await roleOf(alice.id)).toBe('user')
    expect(await roleOf(bob.id)).toBe('user')
  })

  it('DB-04 ni un admin puede cambiar roles desde el cliente (solo vía service role en servidor)', async () => {
    await asBoss.from('profiles').update({ role: 'admin' }).eq('id', bob.id)
    expect(await roleOf(bob.id)).toBe('user')
  })
})

describe('profiles: integridad', () => {
  it("DB-07 role solo acepta 'admin' o 'user'", async () => {
    const { error } = await adminClient().from('profiles').update({ role: 'superadmin' }).eq('id', bob.id)
    expect(error).not.toBeNull()
    expect(await roleOf(bob.id)).toBe('user')
  })

  it('DB-08 crear usuario crea perfil con role user y su email', async () => {
    const email = uniqueEmail('trigger')
    const { data } = await adminClient().auth.admin.createUser({ email, password: strongPassword(), email_confirm: true })
    const { data: profile } = await adminClient().from('profiles').select('role, email').eq('id', data.user!.id).single()
    expect(profile).toEqual({ role: 'user', email })
    await deleteUsers([data.user!.id])
  })

  it('DB-09 borrar usuario borra su perfil', async () => {
    const temp = await createUser({ prefix: 'cascade' })
    await deleteUsers([temp.id])
    const { data } = await adminClient().from('profiles').select('id').eq('id', temp.id)
    expect(data).toEqual([])
  })
})

describe('registro público', () => {
  it('SIG-01 signUp con la clave pública falla y no crea usuario', async () => {
    const email = uniqueEmail('signup')
    const { error } = await anonClient().auth.signUp({ email, password: strongPassword() })
    expect(error).not.toBeNull()
    expect(await findUserByEmail(email)).toBeNull()
  })
})
