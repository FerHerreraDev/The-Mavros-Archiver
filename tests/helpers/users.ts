import { randomBytes } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { readLocalSupabase, assertLocalUrl } from './local-supabase'
import { CookieJar } from './cookie-jar'

export type TestUser = { id: string; email: string; password: string }

export function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${randomBytes(3).toString('hex')}@example.com`
}

export function strongPassword() {
  return `pw-${randomBytes(8).toString('hex')}`
}

export function randomIp() {
  const b = randomBytes(3)
  return `10.${b[0]}.${b[1]}.${b[2]}`
}

/** Cliente service role del Supabase local, solo para preparar/limpiar datos */
export function adminClient(): SupabaseClient {
  const { url, serviceRoleKey } = readLocalSupabase()
  assertLocalUrl(url)
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** Cliente con la clave pública (lo mismo que tiene el navegador) */
export function anonClient(): SupabaseClient {
  const { url, anonKey } = readLocalSupabase()
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** Usuario con contraseña y email confirmado, como uno que ya completó su invitación */
export async function createUser(opts: { role?: 'admin' | 'user'; prefix?: string } = {}): Promise<TestUser> {
  const admin = adminClient()
  const email = uniqueEmail(opts.prefix ?? opts.role ?? 'user')
  const password = strongPassword()

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { password_set: true },
  })
  if (error || !data.user) throw new Error(`createUser falló: ${error?.message}`)

  if (opts.role === 'admin') {
    const { error: roleError } = await admin.from('profiles').update({ role: 'admin' }).eq('id', data.user.id)
    if (roleError) throw new Error(`No se pudo hacer admin: ${roleError.message}`)
  }

  return { id: data.user.id, email, password }
}

export async function deleteUsers(ids: string[]) {
  const admin = adminClient()
  await Promise.all(ids.map((id) => admin.auth.admin.deleteUser(id)))
}

export async function findUserByEmail(email: string) {
  const admin = adminClient()
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (error) throw error
  return data.users.find((u) => u.email === email) ?? null
}

/** Cliente autenticado con la clave pública (para probar RLS como ese usuario) */
export async function signedInClient(user: Pick<TestUser, 'email' | 'password'>): Promise<SupabaseClient> {
  const client = anonClient()
  const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password })
  if (error) throw new Error(`signIn falló para ${user.email}: ${error.message}`)
  return client
}

/** Cookies de sesión @supabase/ssr reales para ese usuario, como las tendría el navegador */
export async function sessionCookies(user: Pick<TestUser, 'email' | 'password'>): Promise<CookieJar> {
  const { url, anonKey } = readLocalSupabase()
  const jar = new CookieJar()
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (cookies) => cookies.forEach(({ name, value, options }) => jar.set(name, value, options)),
    },
  })
  const { error } = await supabase.auth.signInWithPassword({ email: user.email, password: user.password })
  if (error) throw new Error(`signIn falló para ${user.email}: ${error.message}`)
  return jar
}
