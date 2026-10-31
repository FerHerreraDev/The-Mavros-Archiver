import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { GET } from '@/app/api/app/latest/route'
import { resetRequest } from '../helpers/request-context'
import { adminClient, createUser, deleteUsers, sessionCookies, type TestUser } from '../helpers/users'
import { readLocalSupabase } from '../helpers/local-supabase'

// UPD-03. Usa solo la app `mobile` (la prueba de RLS usa `tv`): así sabe cuál es la más nueva.
let viewer: TestUser
const base = 900000 + Math.floor(Math.random() * 50000)
const apk = Buffer.from('PK apk de prueba')
const sha = (c: string) => c.repeat(64)

beforeAll(async () => {
  viewer = await createUser({ prefix: 'upd-route' })
  await adminClient().from('app_releases').delete().eq('app', 'mobile')
})
afterAll(async () => {
  await adminClient().from('app_releases').delete().eq('app', 'mobile')
  await adminClient().storage.from('apps').remove([`mobile/${base}.apk`, `mobile/${base + 1}.apk`])
  await deleteUsers([viewer.id])
})

async function call(app: string | null, opts: { as?: TestUser; bearer?: string } = {}) {
  resetRequest({ cookies: opts.as ? await sessionCookies(opts.as) : undefined })
  const headers: Record<string, string> = opts.bearer ? { authorization: `Bearer ${opts.bearer}` } : {}
  const url = `http://localhost/api/app/latest${app === null ? '' : `?app=${app}`}`
  const res = await GET(new NextRequest(url, { headers }))
  return { res, body: res.status === 204 ? null : await res.json() }
}

async function accessTokenFor(user: TestUser) {
  const { url, anonKey } = readLocalSupabase()
  const client = createClient(url, anonKey, { auth: { persistSession: false } })
  const { data } = await client.auth.signInWithPassword({ email: user.email, password: user.password })
  return data.session!.access_token
}

async function publish(code: number, name: string, digit: string) {
  const path = `mobile/${code}.apk`
  const up = await adminClient().storage.from('apps').upload(path, apk, { contentType: 'application/vnd.android.package-archive', upsert: true })
  if (up.error) throw up.error
  const { error } = await adminClient().from('app_releases').insert({ app: 'mobile', version_code: code, version_name: name, apk_path: path, sha256: sha(digit) })
  if (error) throw error
}

describe('GET /api/app/latest (UPD-03)', () => {
  it('sin sesión → 401', async () => {
    expect((await call('mobile')).res.status).toBe(401)
    expect((await call('mobile', { bearer: 'no-es-un-jwt' })).res.status).toBe(401)
  })

  it('app inválida → 400', async () => {
    expect((await call('web', { as: viewer })).res.status).toBe(400)
    expect((await call(null, { as: viewer })).res.status).toBe(400)
  })

  it('sin versiones publicadas → 204', async () => {
    const { res } = await call('mobile', { as: viewer })
    expect(res.status).toBe(204)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('responde la versión más alta con un enlace firmado que descarga el APK', async () => {
    await publish(base, '9.0.0', 'a')
    await publish(base + 1, '9.0.1', 'b')

    const { res, body } = await call('mobile', { bearer: await accessTokenFor(viewer) })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(body).toMatchObject({ version_code: base + 1, version_name: '9.0.1', sha256: sha('b') })

    // Enlace firmado de ~15 min (el token lo dice) que sí baja el archivo
    const token = new URL(body.url).searchParams.get('token')!
    const { exp, iat } = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
    expect(exp - iat).toBe(15 * 60)
    const download = await fetch(body.url)
    expect(download.status).toBe(200)
    expect(Buffer.from(await download.arrayBuffer())).toEqual(apk)
  })

  it('usuario desactivado (con su sesión de antes) → 401', async () => {
    const banned = await createUser({ prefix: 'upd-banned' })
    const cookies = await sessionCookies(banned)
    await adminClient().auth.admin.updateUserById(banned.id, { ban_duration: '24h' })
    resetRequest({ cookies })
    const res = await GET(new NextRequest('http://localhost/api/app/latest?app=mobile'))
    expect(res.status).toBe(401)
    await deleteUsers([banned.id])
  })
})
