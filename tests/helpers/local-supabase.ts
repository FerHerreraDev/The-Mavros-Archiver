import { execFileSync } from 'node:child_process'
import path from 'node:path'

/**
 * Lee las credenciales del Supabase LOCAL (`supabase start`).
 * Las pruebas nunca usan .env.local: así es imposible que toquen producción.
 */
export type LocalSupabase = {
  url: string
  anonKey: string
  serviceRoleKey: string
  mailpitUrl: string
}

export const E2E_PORT = 3100
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`

let cached: LocalSupabase | null = null

export function assertLocalUrl(url: string) {
  const { hostname } = new URL(url)
  if (hostname !== '127.0.0.1' && hostname !== 'localhost') {
    throw new Error(`Las pruebas solo corren contra Supabase local. URL recibida: ${url}`)
  }
}

export function readLocalSupabase(): LocalSupabase {
  if (cached) return cached

  // Las pruebas siempre se lanzan desde la raíz del repo (pnpm test / playwright)
  const root = process.cwd()
  let raw: string
  try {
    raw = execFileSync(path.join(root, 'node_modules/.bin/supabase'), ['status', '-o', 'json'], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).toString()
  } catch {
    throw new Error('Supabase local no está corriendo. Ejecuta: pnpm db:start')
  }

  const status = JSON.parse(raw.slice(raw.indexOf('{')))
  const local: LocalSupabase = {
    url: status.API_URL,
    anonKey: status.ANON_KEY,
    serviceRoleKey: status.SERVICE_ROLE_KEY,
    mailpitUrl: status.MAILPIT_URL ?? status.INBUCKET_URL,
  }

  assertLocalUrl(local.url)
  assertLocalUrl(local.mailpitUrl)

  cached = local
  return local
}

/** Variables de entorno con las que corre la app durante las pruebas */
export function appTestEnv(local: LocalSupabase, siteUrl = E2E_BASE_URL): Record<string, string> {
  return {
    NEXT_PUBLIC_SUPABASE_URL: local.url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: local.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: local.serviceRoleKey,
    NEXT_PUBLIC_SITE_URL: siteUrl,
  }
}
