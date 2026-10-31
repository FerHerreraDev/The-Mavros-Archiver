import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { adminClient, anonClient, createUser, deleteUsers, signedInClient, type TestUser } from '../helpers/users'

// UPD-01, UPD-02: versiones legibles con sesión, escritas solo por la service role; APK privados
let viewer: TestUser
let boss: TestUser
let asViewer: SupabaseClient
let asBoss: SupabaseClient
const code = 800000 + Math.floor(Math.random() * 90000)
const sha = 'a'.repeat(64)
const row = (fields: Record<string, unknown> = {}) => ({ app: 'tv', version_code: code, version_name: '9.9.9', apk_path: `tv/${code}.apk`, sha256: sha, ...fields })

beforeAll(async () => {
  ;[viewer, boss] = await Promise.all([createUser({ prefix: 'upd-viewer' }), createUser({ role: 'admin', prefix: 'upd-boss' })])
  ;[asViewer, asBoss] = await Promise.all([signedInClient(viewer), signedInClient(boss)])
  const { error } = await adminClient().from('app_releases').insert(row())
  if (error) throw error
})
afterAll(async () => {
  await adminClient().from('app_releases').delete().gte('version_code', code).lte('version_code', code + 10)
  await adminClient().storage.from('apps').remove([`tv/${code}.apk`])
  await deleteUsers([viewer.id, boss.id])
})

describe('app_releases (UPD-01)', () => {
  it('un usuario con sesión la lee; un anónimo no', async () => {
    const { data } = await asViewer.from('app_releases').select('version_name').eq('version_code', code)
    expect(data).toEqual([{ version_name: '9.9.9' }])
    expect((await anonClient().from('app_releases').select('id').eq('version_code', code)).data ?? []).toEqual([])
  })

  it('nadie la escribe desde el cliente, ni un admin', async () => {
    for (const client of [asViewer, asBoss, anonClient()]) {
      expect((await client.from('app_releases').insert(row({ version_code: code + 1 }))).error).not.toBeNull()
      expect((await client.from('app_releases').update({ version_name: 'hack' }).eq('version_code', code).select('id')).data ?? []).toEqual([])
      expect((await client.from('app_releases').delete().eq('version_code', code).select('id')).data ?? []).toEqual([])
    }
    const { data } = await adminClient().from('app_releases').select('version_name').eq('version_code', code).single()
    expect(data!.version_name).toBe('9.9.9')
  })

  it('un version_code no se repite para la misma app y debe ser válido', async () => {
    expect((await adminClient().from('app_releases').insert(row())).error).not.toBeNull()
    expect((await adminClient().from('app_releases').insert(row({ version_code: 0 }))).error).not.toBeNull()
    expect((await adminClient().from('app_releases').insert(row({ version_code: code + 2, app: 'web' }))).error).not.toBeNull()
    expect((await adminClient().from('app_releases').insert(row({ version_code: code + 3, sha256: 'xyz' }))).error).not.toBeNull()
  })
})

describe('bucket apps (UPD-02)', () => {
  const apk = Buffer.from('PK fake apk')
  const type = 'application/vnd.android.package-archive'

  it('la service role sube; nadie más sube, lista ni descarga', async () => {
    const path = `tv/${code}.apk`
    expect((await adminClient().storage.from('apps').upload(path, apk, { contentType: type, upsert: true })).error).toBeNull()
    for (const client of [asViewer, asBoss, anonClient()]) {
      expect((await client.storage.from('apps').upload(`tv/${code}-x.apk`, apk, { contentType: type })).error).not.toBeNull()
      expect((await client.storage.from('apps').list('tv')).data ?? []).toEqual([])
      expect((await client.storage.from('apps').download(path)).data).toBeNull()
      expect((await client.storage.from('apps').createSignedUrl(path, 60)).data).toBeNull()
    }
  })
})
