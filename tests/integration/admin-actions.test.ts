import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { NextRequest } from 'next/server'
import {
  inviteUserAction,
  updateUserRoleAction,
  resendInviteAction,
  setUserActiveAction,
} from '@/lib/actions/admin.actions'
import { listUsersForAdmin } from '@/lib/data/admin-users'
import { GET as confirmGET } from '@/app/auth/confirm/route'
import { proxy } from '@/proxy'
import { resetRequest, runAndCaptureRedirect, formData } from '../helpers/request-context'
import {
  adminClient,
  anonClient,
  createUser,
  deleteUsers,
  findUserByEmail,
  randomIp,
  sessionCookies,
  uniqueEmail,
  type TestUser,
} from '../helpers/users'
import { listEmailsTo, readEmail, waitForEmailCount, expectNoEmail, extractLink } from '../helpers/mailpit'
import { E2E_BASE_URL } from '../helpers/local-supabase'

let boss: TestUser
let regular: TestUser
const created: string[] = []

beforeAll(async () => {
  boss = await createUser({ role: 'admin', prefix: 'boss' })
  regular = await createUser({ prefix: 'regular' })
  created.push(boss.id, regular.id)
})
afterAll(() => deleteUsers(created))

async function as(user: TestUser | null) {
  resetRequest({ ip: randomIp(), cookies: user ? await sessionCookies(user) : undefined })
}

async function newUser(role: 'admin' | 'user' = 'user') {
  const u = await createUser({ role, prefix: 'target' })
  created.push(u.id)
  return u
}

/** Invitado que todavía no abrió el link */
async function pendingInvite() {
  const email = uniqueEmail('pending')
  const { data, error } = await adminClient().auth.admin.inviteUserByEmail(email, {
    redirectTo: `${E2E_BASE_URL}/auth/confirm?next=/set-password`,
  })
  if (error) throw error
  created.push(data.user.id)
  await waitForEmailCount(email, 1)
  return { id: data.user.id, email }
}

async function roleOf(id: string) {
  const { data } = await adminClient().from('profiles').select('role').eq('id', id).single()
  return data?.role
}

async function isBannedNow(id: string) {
  const { data } = await adminClient().auth.admin.getUserById(id)
  const until = (data.user as { banned_until?: string } | null)?.banned_until
  return !!until && new Date(until) > new Date()
}

async function canLogin(user: TestUser) {
  const { error } = await anonClient().auth.signInWithPassword({ email: user.email, password: user.password })
  return !error
}

/** Abre el link de un correo contra /auth/confirm y devuelve a dónde terminó */
async function openEmailLink(html: string) {
  const link = extractLink(html, '/auth/confirm')
  resetRequest()
  const { redirect } = await runAndCaptureRedirect(() => confirmGET(new NextRequest(link)))
  return redirect
}

describe('ADM-12 nadie sin rol admin puede usar las acciones ni ver la tabla', () => {
  for (const who of ['anónimo', 'user'] as const) {
    it(`${who}: cambiar rol → error y el rol no cambia`, async () => {
      const target = await newUser()
      await as(who === 'user' ? regular : null)
      const result = await updateUserRoleAction({ userId: target.id, role: 'admin' })
      expect(result.error).toBeTruthy()
      expect(await roleOf(target.id)).toBe('user')
    })

    it(`${who}: desactivar → error y sigue activo`, async () => {
      const target = await newUser()
      await as(who === 'user' ? regular : null)
      const result = await setUserActiveAction({ userId: target.id, active: false })
      expect(result.error).toBeTruthy()
      expect(await isBannedNow(target.id)).toBe(false)
      expect(await canLogin(target)).toBe(true)
    })

    it(`${who}: reenviar invitación → error y no llega correo nuevo`, async () => {
      const pending = await pendingInvite()
      await as(who === 'user' ? regular : null)
      const result = await resendInviteAction({ userId: pending.id })
      expect(result.error).toBeTruthy()
      await new Promise((r) => setTimeout(r, 1500))
      expect(await listEmailsTo(pending.email)).toHaveLength(1)
    })

    it(`${who}: invitar → error, sin usuario ni correo`, async () => {
      await as(who === 'user' ? regular : null)
      const email = uniqueEmail('adm12')
      const result = await inviteUserAction(formData({ email }))
      expect(result.error).toBeTruthy()
      expect(await findUserByEmail(email)).toBeNull()
      await expectNoEmail(email)
    })

    it(`${who}: la tabla de usuarios no se entrega`, async () => {
      await as(who === 'user' ? regular : null)
      expect(await listUsersForAdmin()).toBeNull()
    })
  }
})

describe('ADM-05 tabla de usuarios', () => {
  it('incluye a todos con email, rol, estado, alta y último acceso', async () => {
    const pending = await pendingInvite()
    const disabled = await newUser()
    await adminClient().auth.admin.updateUserById(disabled.id, { ban_duration: '24h' })

    await as(boss)
    const rows = (await listUsersForAdmin())!
    const byId = new Map(rows.map((r) => [r.id, r]))

    // Aparecen usuarios de todos los estados y roles (otras pruebas crean/borran en paralelo,
    // así que no se compara el total)
    for (const id of [boss.id, regular.id, pending.id, disabled.id]) expect(byId.has(id)).toBe(true)

    expect(byId.get(boss.id)).toMatchObject({ email: boss.email, role: 'admin', status: 'active', isSelf: true })
    expect(byId.get(regular.id)).toMatchObject({ email: regular.email, role: 'user', status: 'active', isSelf: false })
    expect(byId.get(pending.id)).toMatchObject({ email: pending.email, status: 'pending', lastSignInAt: null })
    expect(byId.get(disabled.id)?.status).toBe('disabled')
    expect(Date.parse(byId.get(regular.id)!.createdAt)).not.toBeNaN()
    // boss inició sesión para esta prueba
    expect(byId.get(boss.id)!.lastSignInAt).not.toBeNull()
  })
})

describe('ADM-06 / ADM-07 cambiar rol', () => {
  it('ADM-06 admin hace admin a un user y luego se lo quita', async () => {
    const target = await newUser()
    await as(boss)

    expect((await updateUserRoleAction({ userId: target.id, role: 'admin' })).success).toBeTruthy()
    expect(await roleOf(target.id)).toBe('admin')

    // Efecto en el siguiente request del usuario: ya puede usar acciones de admin
    await as(target)
    expect(await listUsersForAdmin()).not.toBeNull()

    await as(boss)
    expect((await updateUserRoleAction({ userId: target.id, role: 'user' })).success).toBeTruthy()
    expect(await roleOf(target.id)).toBe('user')

    await as(target)
    expect(await listUsersForAdmin()).toBeNull()
  })

  it('ADM-07 un admin no puede cambiar su propio rol', async () => {
    await as(boss)
    const result = await updateUserRoleAction({ userId: boss.id, role: 'user' })
    expect(result.error).toBeTruthy()
    expect(await roleOf(boss.id)).toBe('admin')
  })
})

describe('ADM-08 reenviar invitación', () => {
  it('a un pendiente que no abrió el link: llega un correo nuevo con link funcional', async () => {
    const pending = await pendingInvite()
    await as(boss)
    const result = await resendInviteAction({ userId: pending.id })
    expect(result.success).toBeTruthy()

    const mail = await waitForEmailCount(pending.email, 2)
    expect(await openEmailLink(mail.HTML)).toBe('/set-password')
  })

  it('a un pendiente que abrió el link pero no eligió contraseña: también llega link funcional', async () => {
    const pending = await pendingInvite()
    const [first] = await listEmailsTo(pending.email)
    const firstMail = await readEmail(first.ID)
    expect(await openEmailLink(firstMail.HTML)).toBe('/set-password')

    await as(boss)
    const result = await resendInviteAction({ userId: pending.id })
    expect(result.success).toBeTruthy()

    const mail = await waitForEmailCount(pending.email, 2)
    expect(await openEmailLink(mail.HTML)).toBe('/set-password')
  })

  it('a un usuario activo → error, sin correo', async () => {
    const active = await newUser()
    await as(boss)
    const result = await resendInviteAction({ userId: active.id })
    expect(result.error).toBeTruthy()
    await expectNoEmail(active.email)
  })

  it('a un usuario desactivado → error, sin correo nuevo', async () => {
    const pending = await pendingInvite()
    await adminClient().auth.admin.updateUserById(pending.id, { ban_duration: '24h' })
    await as(boss)
    const result = await resendInviteAction({ userId: pending.id })
    expect(result.error).toBeTruthy()
    await new Promise((r) => setTimeout(r, 1500))
    expect(await listEmailsTo(pending.email)).toHaveLength(1)
  })
})

describe('ADM-09 / ADM-10 / ADM-11 desactivar y reactivar', () => {
  it('ADM-09 desactivado no puede hacer login y pierde la sesión que tenía abierta', async () => {
    const target = await newUser()
    const openSession = await sessionCookies(target)

    await as(boss)
    expect((await setUserActiveAction({ userId: target.id, active: false })).success).toBeTruthy()

    expect(await canLogin(target)).toBe(false)

    // Con las cookies de la sesión que ya tenía abierta
    const res = await proxy(
      new NextRequest(`${E2E_BASE_URL}/dashboard`, { headers: { cookie: openSession.toHeader() } })
    )
    expect(new URL(res.headers.get('location') ?? `${E2E_BASE_URL}/dashboard`).pathname).toBe('/login')

    // Y las Server Actions tampoco lo reconocen
    resetRequest({ ip: randomIp(), cookies: openSession })
    expect(await listUsersForAdmin()).toBeNull()
  })

  it('ADM-09 un admin desactivado pierde también sus permisos de admin', async () => {
    const otherAdmin = await newUser('admin')
    const openSession = await sessionCookies(otherAdmin)

    await as(boss)
    await setUserActiveAction({ userId: otherAdmin.id, active: false })

    resetRequest({ ip: randomIp(), cookies: openSession })
    const result = await updateUserRoleAction({ userId: regular.id, role: 'admin' })
    expect(result.error).toBeTruthy()
    expect(await roleOf(regular.id)).toBe('user')
  })

  it('ADM-10 reactivado vuelve a hacer login con su contraseña', async () => {
    const target = await newUser()
    await as(boss)
    await setUserActiveAction({ userId: target.id, active: false })
    expect(await canLogin(target)).toBe(false)

    const result = await setUserActiveAction({ userId: target.id, active: true })
    expect(result.success).toBeTruthy()
    expect(await canLogin(target)).toBe(true)
  })

  it('ADM-09 la sesión que tenía abierta no revive al reactivarlo', async () => {
    const target = await newUser()
    const openSession = await sessionCookies(target)

    await as(boss)
    await setUserActiveAction({ userId: target.id, active: false })
    await setUserActiveAction({ userId: target.id, active: true })

    const res = await proxy(
      new NextRequest(`${E2E_BASE_URL}/dashboard`, { headers: { cookie: openSession.toHeader() } })
    )
    expect(new URL(res.headers.get('location') ?? `${E2E_BASE_URL}/dashboard`).pathname).toBe('/login')

    resetRequest({ ip: randomIp(), cookies: openSession })
    expect(await listUsersForAdmin()).toBeNull()
  })

  it('ADM-11 un admin no puede desactivarse a sí mismo', async () => {
    await as(boss)
    const result = await setUserActiveAction({ userId: boss.id, active: false })
    expect(result.error).toBeTruthy()
    expect(await isBannedNow(boss.id)).toBe(false)
  })
})

describe('ADM-13 validación de entrada', () => {
  it.each(['no-es-uuid', '', "' OR 1=1 --", '123'])('userId inválido %j → error en todas las acciones', async (userId) => {
    await as(boss)
    expect((await updateUserRoleAction({ userId, role: 'admin' })).error).toBeTruthy()
    expect((await resendInviteAction({ userId })).error).toBeTruthy()
    expect((await setUserActiveAction({ userId, active: false })).error).toBeTruthy()
  })

  it('rol fuera de admin/user → error y no cambia', async () => {
    const target = await newUser()
    await as(boss)
    expect((await updateUserRoleAction({ userId: target.id, role: 'superadmin' })).error).toBeTruthy()
    expect(await roleOf(target.id)).toBe('user')
  })

  it('UUID que no existe → error (no éxito falso)', async () => {
    const ghost = crypto.randomUUID()
    await as(boss)
    const results = [
      await updateUserRoleAction({ userId: ghost, role: 'admin' }),
      await resendInviteAction({ userId: ghost }),
      await setUserActiveAction({ userId: ghost, active: false }),
    ]
    for (const r of results) {
      expect(r.success).toBeUndefined()
      expect(r.error).toBeTruthy()
    }
  })
})
