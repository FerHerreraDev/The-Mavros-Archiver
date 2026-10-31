import 'server-only'
import type { NextRequest } from 'next/server'
import { createClient as createSupabaseClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { isBanned } from '@/lib/user-status'

const bearerOf = (request: NextRequest) => request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]

/**
 * Cliente de Supabase según quién llama:
 * - Apps (Android, iPad): Authorization: Bearer <access token>
 * - Web: cookies de sesión
 * En ambos casos las consultas pasan por RLS como ese usuario.
 */
async function clientFor(request: NextRequest, bearer: string | undefined): Promise<SupabaseClient> {
  if (bearer) {
    return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return createClient()
}

/** Usuario con sesión válida (no desactivado) y su cliente; user null = responder 401 */
export async function requestUser(request: NextRequest): Promise<{ supabase: SupabaseClient; user: User | null }> {
  const bearer = bearerOf(request)
  const supabase = await clientFor(request, bearer)
  const { data: { user } } = await supabase.auth.getUser(bearer)
  return { supabase, user: user && !isBanned(user) ? user : null }
}
