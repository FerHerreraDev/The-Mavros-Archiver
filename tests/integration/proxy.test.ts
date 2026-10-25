import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { NextRequest } from 'next/server'
import { proxy } from '@/proxy'
import { adminClient, createUser, deleteUsers, sessionCookies, uniqueEmail, strongPassword, type TestUser } from '../helpers/users'
import { CookieJar } from '../helpers/cookie-jar'
import { E2E_BASE_URL } from '../helpers/local-supabase'

async function visit(pathname: string, cookies?: CookieJar) {
  const res = await proxy(
    new NextRequest(`${E2E_BASE_URL}${pathname}`, { headers: cookies ? { cookie: cookies.toHeader() } : {} })
  )
  const location = res.headers.get('location')
  return { status: res.status, location: location ? new URL(location) : null }
}

let user: TestUser
let invitedNoPassword: TestUser
let userCookies: CookieJar
let invitedCookies: CookieJar

beforeAll(async () => {
  user = await createUser()
  userCookies = await sessionCookies(user)

  // Invitado que abrió el link (tiene sesión) pero aún no eligió contraseña:
  // se invita y se le da contraseña "técnica" solo para poder abrir sesión en la prueba,
  // sin la marca password_set, que es como queda tras /auth/confirm.
  const admin = adminClient()
  const email = uniqueEmail('invited')
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email)
  if (error || !data.user) throw error
  const password = strongPassword()
  await admin.auth.admin.updateUserById(data.user.id, { password, email_confirm: true })
  invitedNoPassword = { id: data.user.id, email, password }
  invitedCookies = await sessionCookies(invitedNoPassword)
})

afterAll(async () => {
  await deleteUsers([user.id, invitedNoPassword.id])
})

describe('proxy sin sesión', () => {
  it.each(['/dashboard', '/dashboard/profile', '/dashboard/admin'])('ACC-01 %s → /login?redirectTo=<ruta>', async (path) => {
    const { status, location } = await visit(path)
    expect(status).toBe(307)
    expect(location?.pathname).toBe('/login')
    expect(location?.searchParams.get('redirectTo')).toBe(path)
  })

  it('ACC-04 /set-password → /login', async () => {
    const { location } = await visit('/set-password')
    expect(location?.pathname).toBe('/login')
  })

  it.each(['/login', '/forgot-password'])('ACC-06 %s es accesible', async (path) => {
    const { status, location } = await visit(path)
    expect(location).toBeNull()
    expect(status).toBe(200)
  })

  it('CNF /auth/confirm no lo bloquea el proxy', async () => {
    const { location } = await visit('/auth/confirm?token_hash=x&type=invite')
    expect(location).toBeNull()
  })
})

describe('proxy con sesión', () => {
  it('ACC-01 /dashboard pasa', async () => {
    const { location } = await visit('/dashboard', userCookies)
    expect(location).toBeNull()
  })

  it.each(['/login', '/forgot-password'])('ACC-02/ACC-06 %s → /dashboard', async (path) => {
    const { location } = await visit(path, userCookies)
    expect(location?.pathname).toBe('/dashboard')
  })

  it('/set-password es accesible con sesión (recuperación)', async () => {
    const { location } = await visit('/set-password', userCookies)
    expect(location).toBeNull()
  })
})

describe('proxy: invitado sin contraseña', () => {
  it.each(['/dashboard', '/dashboard/profile', '/login', '/forgot-password'])('ACC-05 %s → /set-password', async (path) => {
    const { location } = await visit(path, invitedCookies)
    expect(location?.pathname).toBe('/set-password')
  })

  it('ACC-05 /set-password pasa', async () => {
    const { location } = await visit('/set-password', invitedCookies)
    expect(location).toBeNull()
  })
})
