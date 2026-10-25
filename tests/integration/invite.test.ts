import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { inviteUserAction } from '@/lib/actions/admin.actions'
import { resetRequest, formData } from '../helpers/request-context'
import { adminClient, createUser, deleteUsers, findUserByEmail, randomIp, sessionCookies, uniqueEmail, type TestUser } from '../helpers/users'
import { waitForEmail, expectNoEmail, extractLink } from '../helpers/mailpit'
import { E2E_BASE_URL } from '../helpers/local-supabase'

let admin: TestUser
let regular: TestUser
const created: string[] = []

beforeAll(async () => {
  admin = await createUser({ role: 'admin' })
  regular = await createUser({ role: 'user' })
  created.push(admin.id, regular.id)
})

afterAll(async () => {
  await deleteUsers(created)
})

async function as(user: TestUser | null) {
  resetRequest({ ip: randomIp(), cookies: user ? await sessionCookies(user) : undefined })
}

async function invite(email: string) {
  const result = await inviteUserAction(formData({ email }))
  const invited = await findUserByEmail(email)
  if (invited) created.push(invited.id)
  return result
}

describe('inviteUserAction: autorización', () => {
  beforeEach(() => resetRequest({ ip: randomIp() }))

  it('INV-01 sin sesión → error, sin usuario creado y sin correo', async () => {
    await as(null)
    const email = uniqueEmail('inv-anon')
    const result = await invite(email)
    expect(result.error).toBeTruthy()
    expect(result.success).toBeUndefined()
    expect(await findUserByEmail(email)).toBeNull()
    await expectNoEmail(email)
  })

  it('INV-01 usuario con rol user → error, sin usuario creado y sin correo', async () => {
    await as(regular)
    const email = uniqueEmail('inv-by-user')
    const result = await invite(email)
    expect(result.error).toBeTruthy()
    expect(result.success).toBeUndefined()
    expect(await findUserByEmail(email)).toBeNull()
    await expectNoEmail(email)
  })

  it('INV-01 admin → éxito, el invitado existe y recibe correo', async () => {
    await as(admin)
    const email = uniqueEmail('inv-ok')
    const result = await invite(email)
    expect(result.error).toBeUndefined()
    expect(result.success).toBeTruthy()

    const invited = await findUserByEmail(email)
    expect(invited?.invited_at).toBeTruthy()
    await waitForEmail(email)
  })
})

describe('inviteUserAction: datos', () => {
  it('INV-02 email inválido → error, nada enviado', async () => {
    await as(admin)
    const result = await invite('esto-no-es-email')
    expect(result.error).toBeTruthy()
  })

  it('INV-02 email vacío → error', async () => {
    await as(admin)
    const result = await invite('')
    expect(result.error).toBeTruthy()
  })

  it('INV-03 email que ya tiene cuenta → error claro (no éxito)', async () => {
    await as(admin)
    const result = await invite(regular.email)
    expect(result.success).toBeUndefined()
    expect(result.error).toMatch(/registrad|already|existe/i)
  })

  it('INV-06 el correo trae link a <site>/auth/confirm?token_hash=…&type=invite', async () => {
    await as(admin)
    const email = uniqueEmail('inv-link')
    await invite(email)
    const mail = await waitForEmail(email)
    const link = new URL(extractLink(mail.HTML, '/auth/confirm'))
    expect(link.origin).toBe(E2E_BASE_URL)
    expect(link.searchParams.get('type')).toBe('invite')
    expect(link.searchParams.get('token_hash')).toBeTruthy()
  })

  it('DB-08 el invitado obtiene perfil con role user y su email', async () => {
    await as(admin)
    const email = uniqueEmail('inv-profile')
    await invite(email)
    const invited = await findUserByEmail(email)
    const { data } = await adminClient().from('profiles').select('role, email').eq('id', invited!.id).single()
    expect(data).toEqual({ role: 'user', email })
  })
})
