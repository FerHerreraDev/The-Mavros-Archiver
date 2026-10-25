import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/playback/[id]/route'
import { verifyPlaybackToken } from '@/workers/video/src/token'
import { resetRequest } from '../helpers/request-context'
import { adminClient, createUser, deleteUsers, sessionCookies, type TestUser } from '../helpers/users'
import { readLocalSupabase } from '../helpers/local-supabase'
import { createClient } from '@supabase/supabase-js'

const SECRET = 'playback-route-secret-0123456789abcdef'
const CDN = 'https://video.test'

let viewer: TestUser
let boss: TestUser
let publishedId: string
let draftId: string

beforeAll(async () => {
  vi.stubEnv('VIDEO_CDN_URL', CDN)
  vi.stubEnv('VIDEO_TOKEN_SECRET', SECRET)
  ;[viewer, boss] = await Promise.all([createUser({ prefix: 'ply-viewer' }), createUser({ role: 'admin', prefix: 'ply-boss' })])
  const uniq = Math.random().toString(36).slice(2, 8)
  const { data } = await adminClient()
    .from('movies')
    .insert([
      { slug: `ply-pub-${uniq}`, title: 'Pública', duration_seconds: 60, hls_path: `movies/ply-pub-${uniq}/master.m3u8`, status: 'published' },
      { slug: `ply-draft-${uniq}`, title: 'Borrador', duration_seconds: 60, hls_path: `movies/ply-draft-${uniq}/master.m3u8`, status: 'draft' },
    ])
    .select('id, status')
  publishedId = data!.find((m) => m.status === 'published')!.id
  draftId = data!.find((m) => m.status === 'draft')!.id
})

afterAll(async () => {
  await adminClient().from('movies').delete().in('id', [publishedId, draftId])
  await deleteUsers([viewer.id, boss.id])
  vi.unstubAllEnvs()
})

async function call(id: string, opts: { as?: TestUser; bearer?: string } = {}) {
  resetRequest({ cookies: opts.as ? await sessionCookies(opts.as) : undefined })
  const headers: Record<string, string> = opts.bearer ? { authorization: `Bearer ${opts.bearer}` } : {}
  const res = await GET(new NextRequest(`http://localhost/api/playback/${id}`, { headers }), { params: Promise.resolve({ id }) })
  return { res, body: await res.json() }
}

async function accessTokenFor(user: TestUser) {
  const { url, anonKey } = readLocalSupabase()
  const client = createClient(url, anonKey, { auth: { persistSession: false } })
  const { data } = await client.auth.signInWithPassword({ email: user.email, password: user.password })
  return data.session!.access_token
}

describe('GET /api/playback/<id>', () => {
  it('PLY-06 sin sesión → 401', async () => {
    const { res } = await call(publishedId)
    expect(res.status).toBe(401)
  })

  it('PLY-06 token Bearer inválido → 401', async () => {
    const { res } = await call(publishedId, { bearer: 'no-es-un-jwt' })
    expect(res.status).toBe(401)
  })

  it('PLY-07 / PLY-08 usuario + publicada → URL firmada del master con caducidad y no-store', async () => {
    const { res, body } = await call(publishedId, { as: viewer })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')

    const { data: movie } = await adminClient().from('movies').select('hls_path').eq('id', publishedId).single()
    const url = new URL(body.url)
    expect(url.origin).toBe(CDN)
    const [, t, token, ...rest] = url.pathname.split('/')
    expect(t).toBe('t')
    expect(rest.join('/')).toBe(movie!.hls_path)

    // El token sirve justo para la carpeta de esta película y caduca cuando dice expires_at
    const check = await verifyPlaybackToken(token, SECRET)
    expect(check).toEqual({
      ok: true,
      prefix: movie!.hls_path.replace(/master\.m3u8$/, ''),
      expiresAt: Date.parse(body.expires_at) / 1000,
    })
    // ~4 h
    const ttl = Date.parse(body.expires_at) - Date.now()
    expect(ttl).toBeGreaterThan(3.9 * 3600_000)
    expect(ttl).toBeLessThanOrEqual(4 * 3600_000)
  })

  it('PLY-06 también funciona con Authorization: Bearer (app Android)', async () => {
    const { res, body } = await call(publishedId, { bearer: await accessTokenFor(viewer) })
    expect(res.status).toBe(200)
    expect(body.url).toMatch(/^https:\/\/video\.test\/t\//)
  })

  it('PLY-07 usuario + borrador → 404 (igual que si no existiera)', async () => {
    const draft = await call(draftId, { as: viewer })
    const ghost = await call(crypto.randomUUID(), { as: viewer })
    expect(draft.res.status).toBe(404)
    expect(draft.body).toEqual(ghost.body)
  })

  it('PLY-07 admin + borrador → 200', async () => {
    const { res } = await call(draftId, { as: boss })
    expect(res.status).toBe(200)
  })

  it('id con formato inválido → 404', async () => {
    const { res } = await call('../../etc/passwd', { as: viewer })
    expect(res.status).toBe(404)
  })

  it('PLY-08 usuario desactivado (con su sesión de antes) → 401', async () => {
    const banned = await createUser({ prefix: 'ply-banned' })
    const cookies = await sessionCookies(banned)
    await adminClient().auth.admin.updateUserById(banned.id, { ban_duration: '24h' })

    resetRequest({ cookies })
    const res = await GET(new NextRequest(`http://localhost/api/playback/${publishedId}`), { params: Promise.resolve({ id: publishedId }) })
    expect(res.status).toBe(401)
    await deleteUsers([banned.id])
  })
})
