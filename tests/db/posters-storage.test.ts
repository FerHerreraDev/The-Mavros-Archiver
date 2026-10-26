import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { adminClient, anonClient, createUser, deleteUsers, signedInClient, type TestUser } from '../helpers/users'

// LOAD-07: bucket `posters` — solo admins suben/borran; nadie más lista; la URL pública se lee
let viewer: TestUser
let boss: TestUser
let asViewer: SupabaseClient
let asBoss: SupabaseClient
const uploaded: string[] = []
let webp: Buffer

beforeAll(async () => {
  ;[viewer, boss] = await Promise.all([createUser({ prefix: 'stor-viewer' }), createUser({ role: 'admin', prefix: 'stor-boss' })])
  ;[asViewer, asBoss] = await Promise.all([signedInClient(viewer), signedInClient(boss)])
  webp = await sharp({ create: { width: 10, height: 15, channels: 3, background: '#c00' } }).webp().toBuffer()
})
afterAll(async () => {
  if (uploaded.length) await adminClient().storage.from('posters').remove(uploaded)
  await deleteUsers([viewer.id, boss.id])
})

const name = () => `test-${Math.random().toString(36).slice(2, 10)}.webp`

describe('bucket posters (LOAD-07)', () => {
  it('un admin sube WebP y la URL pública se lee sin sesión', async () => {
    const path = name()
    const { error } = await asBoss.storage.from('posters').upload(path, webp, { contentType: 'image/webp' })
    expect(error).toBeNull()
    uploaded.push(path)
    const url = anonClient().storage.from('posters').getPublicUrl(path).data.publicUrl
    expect((await fetch(url)).status).toBe(200)
  })

  it('un user y un anónimo no pueden subir', async () => {
    for (const client of [asViewer, anonClient()]) {
      const path = name()
      const { error } = await client.storage.from('posters').upload(path, webp, { contentType: 'image/webp' })
      expect(error, 'debió rechazarse').not.toBeNull()
    }
  })

  it('solo WebP', async () => {
    const { error } = await asBoss.storage.from('posters').upload(`${name()}.png`, Buffer.from('x'), { contentType: 'image/png' })
    expect(error).not.toBeNull()
  })

  it('un user y un anónimo no pueden listar ni borrar', async () => {
    const path = name()
    await asBoss.storage.from('posters').upload(path, webp, { contentType: 'image/webp' })
    uploaded.push(path)
    for (const client of [asViewer, anonClient()]) {
      const { data } = await client.storage.from('posters').list()
      expect(data ?? []).toEqual([])
      await client.storage.from('posters').remove([path])
    }
    const url = anonClient().storage.from('posters').getPublicUrl(path).data.publicUrl
    expect((await fetch(url)).status, 'sigue ahí').toBe(200)
  })
})
