import { describe, it, expect, afterAll, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { POST as createCode } from '@/app/api/device/code/route'
import { POST as pollToken } from '@/app/api/device/token/route'
import { GET as playback } from '@/app/api/playback/[id]/route'
import { decideDeviceAction } from '@/lib/actions/device.actions'
import { hashDeviceCode, normalizeUserCode } from '@/lib/device-codes'
import { resetRequest, runAndCaptureRedirect, formData } from '../helpers/request-context'
import { adminClient, createUser, deleteUsers, randomIp, sessionCookies, type TestUser } from '../helpers/users'
import { readLocalSupabase, E2E_BASE_URL } from '../helpers/local-supabase'

// Usuarios nuevos en cada prueba: aprobar está limitado a 5 por minuto por usuario (DEV-11),
// así que compartirlos entre pruebas las haría depender unas de otras
let alice: TestUser
let bob: TestUser
const createdMovies: string[] = []
const createdUsers: string[] = []

beforeEach(async () => {
  // Para no esperar 5 s entre sondeos; DEV-02 prueba el intervalo real aparte
  vi.stubEnv('DEVICE_POLL_INTERVAL_SECONDS', '1')
  ;[alice, bob] = await Promise.all([createUser({ prefix: 'dev-alice' }), createUser({ prefix: 'dev-bob' })])
  createdUsers.push(alice.id, bob.id)
})
afterAll(async () => {
  await adminClient().from('movies').delete().in('id', createdMovies)
  await deleteUsers(createdUsers)
  vi.unstubAllEnvs()
})

type CodeResponse = {
  device_code: string
  user_code: string
  verification_uri: string
  verification_uri_complete: string
  expires_in: number
  interval: number
}

async function requestCode(body: Record<string, unknown> = { client_name: 'Hisense Google TV' }, ip = randomIp()) {
  const res = await createCode(
    new NextRequest(`${E2E_BASE_URL}/api/device/code`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify(body),
    })
  )
  return { res, body: (await res.json()) as CodeResponse }
}

async function poll(deviceCode: unknown) {
  const res = await pollToken(
    new NextRequest(`${E2E_BASE_URL}/api/device/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ device_code: deviceCode }),
    })
  )
  return { status: res.status, body: await res.json() }
}

async function decide(user: TestUser, code: string, decision: 'approve' | 'deny') {
  resetRequest({ ip: randomIp(), cookies: await sessionCookies(user) })
  const { redirect } = await runAndCaptureRedirect(() => decideDeviceAction(formData({ code, decision })))
  return redirect
}

const rowFor = async (deviceCode: string) =>
  (await adminClient().from('device_codes').select('*').eq('device_code_hash', await hashDeviceCode(deviceCode)).single()).data

describe('POST /api/device/code (DEV-01)', () => {
  it('devuelve código, URLs, caducidad e intervalo', async () => {
    vi.unstubAllEnvs()
    const { res, body } = await requestCode()
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(body.device_code).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(body.user_code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/)
    expect(body.verification_uri).toBe(`${E2E_BASE_URL}/link`)
    expect(body.verification_uri_complete).toBe(`${E2E_BASE_URL}/link?code=${body.user_code}`)
    expect(body.expires_in).toBe(600)
    expect(body.interval).toBe(5)
  })

  it('guarda el nombre del dispositivo y caduca en 10 min', async () => {
    const { body } = await requestCode({ client_name: 'Hisense 65U7' })
    const row = await rowFor(body.device_code)
    expect(row.client_name).toBe('Hisense 65U7')
    expect(Date.parse(row.expires_at) - Date.parse(row.created_at)).toBeGreaterThan(599_000)
    expect(Date.parse(row.expires_at) - Date.parse(row.created_at)).toBeLessThan(601_000)
  })

  it('limitado por IP: el 6º en un minuto → 429', async () => {
    const ip = randomIp()
    for (let i = 0; i < 5; i++) expect((await requestCode({}, ip)).res.status).toBe(200)
    expect((await requestCode({}, ip)).res.status).toBe(429)
  })
})

describe('POST /api/device/token: antes de aprobar (DEV-02)', () => {
  it('pendiente → authorization_pending', async () => {
    const { body } = await requestCode()
    expect(await poll(body.device_code)).toEqual({ status: 400, body: { error: 'authorization_pending' } })
  })

  it('sondear antes del intervalo real (5 s) → slow_down', async () => {
    vi.unstubAllEnvs()
    const { body } = await requestCode()
    expect((await poll(body.device_code)).body.error).toBe('authorization_pending')
    expect((await poll(body.device_code)).body.error).toBe('slow_down')
  })

  it.each(['', 'x', 'a'.repeat(43), 12345, null])('device_code inválido %j → invalid_grant', async (code) => {
    expect((await poll(code)).body.error).toBe('invalid_grant')
  })

  it('acepta form-urlencoded (RFC 8628)', async () => {
    const { body } = await requestCode()
    const res = await pollToken(
      new NextRequest(`${E2E_BASE_URL}/api/device/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ device_code: body.device_code }).toString(),
      })
    )
    expect((await res.json()).error).toBe('authorization_pending')
  })

  it('caducado → expired_token', async () => {
    const { body } = await requestCode()
    await adminClient().from('device_codes').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('device_code_hash', await hashDeviceCode(body.device_code))
    expect((await poll(body.device_code)).body.error).toBe('expired_token')
  })
})

describe('aprobar y canjear (DEV-04, DEV-09)', () => {
  it('tras aprobar, la tele recibe una sesión de quien aprobó, que funciona y se renueva', async () => {
    const { body } = await requestCode()
    expect(await decide(alice, body.user_code, 'approve')).toBe('/link?result=approved')

    const { status, body: session } = await poll(body.device_code)
    expect(status).toBe(200)
    expect(session.user.id).toBe(alice.id)
    expect(session.token_type).toBe('bearer')
    expect(session.expires_at).toBeGreaterThan(Date.now() / 1000)

    const { url, anonKey } = readLocalSupabase()
    const tv = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
    expect((await tv.auth.getUser(session.access_token)).data.user?.id).toBe(alice.id)
    const refreshed = await tv.auth.refreshSession({ refresh_token: session.refresh_token })
    expect(refreshed.data.session?.user.id).toBe(alice.id)
  })

  it('se entrega una sola vez', async () => {
    const { body } = await requestCode()
    await decide(alice, body.user_code, 'approve')
    expect((await poll(body.device_code)).status).toBe(200)
    expect((await poll(body.device_code)).body.error).toBe('invalid_grant')
  })

  it('aunque lleguen 10 sondeos a la vez, solo uno recibe sesión', async () => {
    const { body } = await requestCode()
    await decide(alice, body.user_code, 'approve')
    vi.stubEnv('DEVICE_POLL_INTERVAL_SECONDS', '1')
    const results = await Promise.all(Array.from({ length: 10 }, () => poll(body.device_code)))
    expect(results.filter((r) => r.status === 200)).toHaveLength(1)
  })

  it('DEV-09 la sesión de la tele respeta RLS y sirve para /api/playback con Bearer', async () => {
    const tag = Math.random().toString(36).slice(2, 8)
    const { data: movies } = await adminClient()
      .from('movies')
      .insert([
        { slug: `dev-pub-${tag}`, title: 'pub', duration_seconds: 60, hls_path: `movies/dev-pub-${tag}/master.m3u8`, status: 'published' },
        { slug: `dev-draft-${tag}`, title: 'draft', duration_seconds: 60, hls_path: `movies/dev-draft-${tag}/master.m3u8`, status: 'draft' },
      ])
      .select('id, status')
    createdMovies.push(...movies!.map((m) => m.id))
    const pub = movies!.find((m) => m.status === 'published')!.id
    const draft = movies!.find((m) => m.status === 'draft')!.id

    const { body } = await requestCode()
    await decide(alice, body.user_code, 'approve')
    const { body: session } = await poll(body.device_code)

    const { url, anonKey } = readLocalSupabase()
    const tv = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${session.access_token}` } },
      auth: { persistSession: false },
    })
    const { data } = await tv.from('movies').select('id').in('id', [pub, draft])
    expect(data?.map((m) => m.id)).toEqual([pub])

    vi.stubEnv('VIDEO_CDN_URL', 'https://video.test')
    vi.stubEnv('VIDEO_TOKEN_SECRET', 'device-flow-secret-0123456789abcdefgh')
    resetRequest()
    const res = await playback(
      new NextRequest(`${E2E_BASE_URL}/api/playback/${pub}`, { headers: { authorization: `Bearer ${session.access_token}` } }),
      { params: Promise.resolve({ id: pub }) }
    )
    expect(res.status).toBe(200)
  })
})

describe('rechazar y reglas de aprobación (DEV-05, DEV-06, DEV-08, DEV-11)', () => {
  it('DEV-05 rechazado → access_denied y ya no se puede aprobar', async () => {
    const { body } = await requestCode()
    expect(await decide(alice, body.user_code, 'deny')).toBe('/link?result=denied')
    expect((await poll(body.device_code)).body.error).toBe('access_denied')
    expect(await decide(alice, body.user_code, 'approve')).toBe(`/link?code=${body.user_code}&error=used`)
  })

  it('DEV-06 otro usuario no puede "robar" un código ya aprobado', async () => {
    const { body } = await requestCode()
    await decide(alice, body.user_code, 'approve')
    expect(await decide(bob, body.user_code, 'approve')).toBe(`/link?code=${body.user_code}&error=used`)
    expect((await rowFor(body.device_code)).user_id).toBe(alice.id)
    expect((await poll(body.device_code)).body.user.id).toBe(alice.id)
  })

  it('DEV-06 código caducado → error expired, sin cambios', async () => {
    const { body } = await requestCode()
    await adminClient().from('device_codes').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('device_code_hash', await hashDeviceCode(body.device_code))
    expect(await decide(alice, body.user_code, 'approve')).toBe(`/link?code=${body.user_code}&error=expired`)
    expect((await rowFor(body.device_code)).status).toBe('pending')
  })

  it('DEV-06 código que no existe o mal formado → error invalid', async () => {
    expect(await decide(alice, 'AAAA-AAAA', 'approve')).toBe('/link?code=AAAA-AAAA&error=invalid')
    expect(await decide(alice, 'no-valido', 'approve')).toBe('/link?error=invalid')
  })

  it('DEV-03 acepta el código en minúsculas y sin guion', async () => {
    const { body } = await requestCode()
    const loose = body.user_code.toLowerCase().replace('-', ' ')
    expect(await decide(alice, loose, 'approve')).toBe('/link?result=approved')
    expect(normalizeUserCode(loose)).toBe(body.user_code.replace('-', ''))
  })

  it('DEV-08 si quien aprobó está desactivado cuando la tele sondea → access_denied', async () => {
    const carol = await createUser({ prefix: 'dev-carol' })
    const { body } = await requestCode()
    await decide(carol, body.user_code, 'approve')
    await adminClient().auth.admin.updateUserById(carol.id, { ban_duration: '24h' })
    expect((await poll(body.device_code)).body).toEqual({ error: 'access_denied' })
    await deleteUsers([carol.id])
  })

  it('DEV-11 más de 5 decisiones por minuto del mismo usuario → rate_limited', async () => {
    const dave = await createUser({ prefix: 'dev-dave' })
    const codes = await Promise.all(Array.from({ length: 6 }, () => requestCode()))
    const results = []
    for (const { body } of codes) results.push(await decide(dave, body.user_code, 'deny'))
    expect(results.slice(0, 5).every((r) => r === '/link?result=denied')).toBe(true)
    expect(results[5]).toBe(`/link?code=${codes[5].body.user_code}&error=rate_limited`)
    await deleteUsers([dave.id])
  })

  it('sin sesión no se puede decidir', async () => {
    const { body } = await requestCode()
    resetRequest({ ip: randomIp() })
    const { redirect } = await runAndCaptureRedirect(() => decideDeviceAction(formData({ code: body.user_code, decision: 'approve' })))
    expect(redirect).toMatch(/^\/login/)
    expect((await rowFor(body.device_code)).status).toBe('pending')
  })
})
