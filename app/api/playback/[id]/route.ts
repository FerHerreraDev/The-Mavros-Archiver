import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { isBanned } from '@/lib/user-status'
import { playbackUrl } from '@/lib/video/playback'

const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })

/**
 * Cliente de Supabase según quién llama:
 * - App Android: Authorization: Bearer <access token>
 * - Web: cookies de sesión
 * En ambos casos las consultas pasan por RLS como ese usuario.
 */
async function clientFor(request: NextRequest): Promise<SupabaseClient> {
  const bearer = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (bearer) {
    return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return createClient()
}

/** GET /api/playback/<movieId> → { url, expires_at } (PLY-06..PLY-08) */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await clientFor(request)
  const bearer = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
  const { data: { user } } = await supabase.auth.getUser(bearer)
  if (!user || isBanned(user)) return json({ error: 'unauthorized' }, 401)

  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'not_found' }, 404)

  // RLS decide: publicadas para cualquiera, borradores solo para admins
  const { data: movie } = await supabase.from('movies').select('hls_path').eq('id', id).maybeSingle()
  if (!movie) return json({ error: 'not_found' }, 404)

  const { url, expiresAt } = await playbackUrl(movie.hls_path)
  return json({ url, expires_at: expiresAt })
}
