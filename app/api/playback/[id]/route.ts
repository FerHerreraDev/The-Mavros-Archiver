import { NextResponse, type NextRequest } from 'next/server'
import { requestUser } from '@/lib/supabase/request'
import { playbackUrl } from '@/lib/video/playback'

const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })

/** GET /api/playback/<movieId> → { url, expires_at } (PLY-06..PLY-08) */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, user } = await requestUser(request)
  if (!user) return json({ error: 'unauthorized' }, 401)

  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'not_found' }, 404)

  // RLS decide: publicadas para cualquiera, borradores solo para admins
  const { data: movie } = await supabase.from('movies').select('hls_path').eq('id', id).maybeSingle()
  if (!movie) return json({ error: 'not_found' }, 404)

  const { url, expiresAt } = await playbackUrl(movie.hls_path)
  return json({ url, expires_at: expiresAt })
}
