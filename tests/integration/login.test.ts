import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { loginAction, logoutAction } from '@/lib/actions/auth.actions'
import { middleware } from '@/middleware'
import { requestContext, resetRequest, runAndCaptureRedirect, formData } from '../helpers/request-context'
import { createUser, deleteUsers, randomIp, uniqueEmail, type TestUser } from '../helpers/users'
import { E2E_BASE_URL } from '../helpers/local-supabase'

let user: TestUser

beforeAll(async () => {
  user = await createUser()
})
afterAll(async () => {
  await deleteUsers([user.id])
})
beforeEach(() => resetRequest({ ip: randomIp() }))

describe('loginAction', () => {
  it('AUTH-01 credenciales válidas → cookie de sesión y redirect a /dashboard', async () => {
    const { redirect } = await runAndCaptureRedirect(() =>
      loginAction(formData({ email: user.email, password: user.password }))
    )
    expect(redirect).toBe('/dashboard')
    expect(requestContext.cookies.hasSupabaseSession()).toBe(true)
  })

  it('AUTH-01 el email no distingue mayúsculas ni espacios', async () => {
    const { redirect } = await runAndCaptureRedirect(() =>
      loginAction(formData({ email: `  ${user.email.toUpperCase()} `, password: user.password }))
    )
    expect(redirect).toBe('/dashboard')
  })

  it('ACC-08 con redirectTo interno vuelve a esa ruta', async () => {
    const { redirect } = await runAndCaptureRedirect(() =>
      loginAction(formData({ email: user.email, password: user.password, redirectTo: '/dashboard/profile' }))
    )
    expect(redirect).toBe('/dashboard/profile')
  })

  it.each(['https://evil.com', '//evil.com', '/\\evil.com'])('ACC-08 redirectTo externo %j → /dashboard', async (redirectTo) => {
    const { redirect } = await runAndCaptureRedirect(() =>
      loginAction(formData({ email: user.email, password: user.password, redirectTo }))
    )
    expect(redirect).toBe('/dashboard')
  })

  it('AUTH-02 contraseña incorrecta → error y sin sesión', async () => {
    const { redirect, result } = await runAndCaptureRedirect(() =>
      loginAction(formData({ email: user.email, password: 'wrong-password-123' }))
    )
    expect(redirect).toBeNull()
    expect(result?.error).toBeTruthy()
    expect(requestContext.cookies.hasSupabaseSession()).toBe(false)
  })

  it('AUTH-02 "email no existe" y "contraseña incorrecta" responden exactamente igual', async () => {
    const wrongPassword = await loginAction(formData({ email: user.email, password: 'wrong-password-123' }))
    resetRequest({ ip: randomIp() })
    const unknownEmail = await loginAction(formData({ email: uniqueEmail('nobody'), password: 'wrong-password-123' }))
    expect(unknownEmail).toEqual(wrongPassword)
  })

  it('AUTH-03 email inválido → fieldErrors.email', async () => {
    const result = await loginAction(formData({ email: 'not-an-email', password: '12345678' }))
    expect(result?.fieldErrors?.email?.length).toBeGreaterThan(0)
  })

  it('AUTH-03 contraseña corta → fieldErrors.password', async () => {
    const result = await loginAction(formData({ email: user.email, password: 'short' }))
    expect(result?.fieldErrors?.password?.length).toBeGreaterThan(0)
  })

  it('AUTH-04 el 6º intento de la misma IP en un minuto se bloquea aunque la contraseña sea correcta', async () => {
    for (let i = 0; i < 5; i++) {
      await loginAction(formData({ email: user.email, password: 'wrong-password-123' }))
    }
    const { redirect, result } = await runAndCaptureRedirect(() =>
      loginAction(formData({ email: user.email, password: user.password }))
    )
    expect(redirect).toBeNull()
    expect(result?.error).toMatch(/too many|demasiados/i)
    expect(requestContext.cookies.hasSupabaseSession()).toBe(false)
  })

  it('AUTH-04 otra IP no se ve afectada', async () => {
    for (let i = 0; i < 6; i++) {
      await loginAction(formData({ email: user.email, password: 'wrong-password-123' }))
    }
    resetRequest({ ip: randomIp() })
    const { redirect } = await runAndCaptureRedirect(() =>
      loginAction(formData({ email: user.email, password: user.password }))
    )
    expect(redirect).toBe('/dashboard')
  })
})

describe('logoutAction', () => {
  it('AUTH-05 cierra sesión, lleva a /login y /dashboard vuelve a pedir login', async () => {
    await runAndCaptureRedirect(() => loginAction(formData({ email: user.email, password: user.password })))
    expect(requestContext.cookies.hasSupabaseSession()).toBe(true)

    const { redirect } = await runAndCaptureRedirect(() => logoutAction())
    expect(redirect).toBe('/login')
    expect(requestContext.cookies.hasSupabaseSession()).toBe(false)

    const res = await middleware(
      new NextRequest(`${E2E_BASE_URL}/dashboard`, { headers: { cookie: requestContext.cookies.toHeader() } })
    )
    expect(new URL(res.headers.get('location')!).pathname).toBe('/login')
  })
})
