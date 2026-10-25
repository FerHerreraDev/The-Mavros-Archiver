import { describe, it, expect, afterAll } from 'vitest'
import { setPasswordAction, forgotPasswordAction } from '@/lib/actions/auth.actions'
import { resetRequest, runAndCaptureRedirect, formData } from '../helpers/request-context'
import {
  adminClient,
  anonClient,
  createUser,
  deleteUsers,
  randomIp,
  sessionCookies,
  strongPassword,
  uniqueEmail,
} from '../helpers/users'
import { waitForEmail, expectNoEmail, extractLink } from '../helpers/mailpit'
import { E2E_BASE_URL } from '../helpers/local-supabase'

const created: string[] = []
afterAll(() => deleteUsers(created))

async function newUser() {
  const user = await createUser({ prefix: 'pwd' })
  created.push(user.id)
  return user
}

async function canLogin(email: string, password: string) {
  const { error } = await anonClient().auth.signInWithPassword({ email, password })
  return !error
}

describe('setPasswordAction', () => {
  it('PWD-05 sin sesión → error y nada cambia', async () => {
    resetRequest({ ip: randomIp() })
    const pw = strongPassword()
    const { redirect, result } = await runAndCaptureRedirect(() =>
      setPasswordAction(formData({ password: pw, confirmPassword: pw }))
    )
    expect(redirect).toBeNull()
    expect(result?.error).toBeTruthy()
  })

  it('PWD-01 servidor rechaza confirmación distinta, sin cambiar la contraseña', async () => {
    const user = await newUser()
    resetRequest({ ip: randomIp(), cookies: await sessionCookies(user) })
    const { redirect, result } = await runAndCaptureRedirect(() =>
      setPasswordAction(formData({ password: 'new-password-1', confirmPassword: 'new-password-2' }))
    )
    expect(redirect).toBeNull()
    expect(result?.fieldErrors?.confirmPassword?.length).toBeGreaterThan(0)
    expect(await canLogin(user.email, user.password)).toBe(true)
  })

  it.each([
    ['7 caracteres', 'a'.repeat(7)],
    ['65 caracteres', 'a'.repeat(65)],
  ])('PWD-01 servidor rechaza %s', async (_label, pw) => {
    const user = await newUser()
    resetRequest({ ip: randomIp(), cookies: await sessionCookies(user) })
    const { redirect, result } = await runAndCaptureRedirect(() =>
      setPasswordAction(formData({ password: pw, confirmPassword: pw }))
    )
    expect(redirect).toBeNull()
    expect(result?.fieldErrors?.password?.length).toBeGreaterThan(0)
  })

  it('PWD-02 contraseña válida → /dashboard, login con la nueva funciona, con la vieja no, y queda password_set', async () => {
    const user = await newUser()
    // Simula invitado: quitar la marca
    await adminClient().auth.admin.updateUserById(user.id, { user_metadata: { password_set: false } })

    resetRequest({ ip: randomIp(), cookies: await sessionCookies(user) })
    const newPw = strongPassword()
    const { redirect } = await runAndCaptureRedirect(() =>
      setPasswordAction(formData({ password: newPw, confirmPassword: newPw }))
    )
    expect(redirect).toBe('/dashboard')
    expect(await canLogin(user.email, newPw)).toBe(true)
    expect(await canLogin(user.email, user.password)).toBe(false)

    const { data } = await adminClient().auth.admin.getUserById(user.id)
    expect(data.user?.user_metadata?.password_set).toBe(true)
  })
})

describe('forgotPasswordAction', () => {
  it('PWD-03 respuesta idéntica para email existente e inexistente; solo el existente recibe correo', async () => {
    const user = await newUser()
    const ghost = uniqueEmail('ghost')

    resetRequest({ ip: randomIp() })
    const forExisting = await forgotPasswordAction(formData({ email: user.email }))
    resetRequest({ ip: randomIp() })
    const forGhost = await forgotPasswordAction(formData({ email: ghost }))

    expect(forGhost).toEqual(forExisting)
    expect(forExisting.error).toBeUndefined()

    const mail = await waitForEmail(user.email)
    const link = new URL(extractLink(mail.HTML, '/auth/confirm'))
    expect(link.origin).toBe(E2E_BASE_URL)
    expect(link.searchParams.get('type')).toBe('recovery')
    await expectNoEmail(ghost)
  })

  it('PWD-03 email inválido → error de validación', async () => {
    resetRequest({ ip: randomIp() })
    const result = await forgotPasswordAction(formData({ email: 'nope' }))
    expect(result.fieldErrors?.email?.length).toBeGreaterThan(0)
  })

  it('rate limit: el 6º pedido de la misma IP en un minuto se bloquea', async () => {
    resetRequest({ ip: randomIp() })
    for (let i = 0; i < 5; i++) await forgotPasswordAction(formData({ email: uniqueEmail('rl') }))
    const result = await forgotPasswordAction(formData({ email: uniqueEmail('rl') }))
    expect(result.error).toMatch(/too many|demasiados/i)
  })
})
