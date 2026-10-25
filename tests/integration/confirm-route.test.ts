import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/auth/confirm/route'
import { requestContext, resetRequest, runAndCaptureRedirect } from '../helpers/request-context'
import { adminClient, createUser, deleteUsers, uniqueEmail } from '../helpers/users'
import { E2E_BASE_URL } from '../helpers/local-supabase'

const created: string[] = []
afterAll(() => deleteUsers(created))
beforeEach(() => resetRequest())

async function tokenFor(type: 'invite' | 'recovery' | 'magiclink') {
  const admin = adminClient()
  let email: string
  if (type === 'invite') {
    email = uniqueEmail('confirm-invite')
  } else {
    const user = await createUser({ prefix: `confirm-${type}` })
    created.push(user.id)
    email = user.email
  }
  const { data, error } = await admin.auth.admin.generateLink({ type, email })
  if (error) throw error
  if (type === 'invite') created.push(data.user.id)
  return data.properties.hashed_token
}

async function confirm(query: string) {
  const { redirect } = await runAndCaptureRedirect(() => GET(new NextRequest(`${E2E_BASE_URL}/auth/confirm?${query}`)))
  // Resolver como lo haría el navegador (Location relativo contra el sitio)
  return redirect === null ? null : new URL(redirect, E2E_BASE_URL)
}

describe('/auth/confirm', () => {
  it('CNF-02 invite válido → /set-password con sesión', async () => {
    const token = await tokenFor('invite')
    const to = await confirm(`token_hash=${token}&type=invite`)
    expect(to?.href).toBe(`${E2E_BASE_URL}/set-password`)
    expect(requestContext.cookies.hasSupabaseSession()).toBe(true)
  })

  it('CNF-02 recovery válido → /set-password con sesión, aunque next diga otra cosa', async () => {
    const token = await tokenFor('recovery')
    const to = await confirm(`token_hash=${token}&type=recovery&next=/dashboard`)
    expect(to?.pathname).toBe('/set-password')
    expect(requestContext.cookies.hasSupabaseSession()).toBe(true)
  })

  it('CNF-03 sin token → /login?error=link_invalid sin sesión', async () => {
    const to = await confirm('')
    expect(to?.pathname).toBe('/login')
    expect(to?.searchParams.get('error')).toBe('link_invalid')
    expect(requestContext.cookies.hasSupabaseSession()).toBe(false)
  })

  it('CNF-03 token inventado → /login?error=link_invalid sin sesión', async () => {
    const to = await confirm('token_hash=pk_0000000000000000&type=invite')
    expect(to?.pathname).toBe('/login')
    expect(to?.searchParams.get('error')).toBe('link_invalid')
    expect(requestContext.cookies.hasSupabaseSession()).toBe(false)
  })

  it('INV-05 un token ya usado no sirve otra vez', async () => {
    const token = await tokenFor('invite')
    await confirm(`token_hash=${token}&type=invite`)
    resetRequest()
    const to = await confirm(`token_hash=${token}&type=invite`)
    expect(to?.pathname).toBe('/login')
    expect(requestContext.cookies.hasSupabaseSession()).toBe(false)
  })

  it('CNF-03 code PKCE inválido → /login?error=link_invalid', async () => {
    const to = await confirm('code=not-a-real-code')
    expect(to?.pathname).toBe('/login')
  })

  it.each([
    'https://evil.com',
    '//evil.com',
    '/\\evil.com',
    '/%5Cevil.com',
    '/\\/evil.com',
    '\\\\evil.com',
    'javascript:alert(1)',
    '/%2F%2Fevil.com',
    ' //evil.com',
  ])('CNF-01 next=%j nunca sale del sitio', async (next) => {
    const token = await tokenFor('magiclink')
    const to = await confirm(`token_hash=${token}&type=magiclink&next=${encodeURIComponent(next)}`)
    expect(to).not.toBeNull()
    expect(to!.origin).toBe(E2E_BASE_URL)
  })

  it('next interno se respeta en links que no son invite/recovery', async () => {
    const token = await tokenFor('magiclink')
    const to = await confirm(`token_hash=${token}&type=magiclink&next=${encodeURIComponent('/dashboard/profile')}`)
    expect(to?.pathname).toBe('/dashboard/profile')
  })
})
