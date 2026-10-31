import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import { requestUser } from '@/lib/supabase/request'
import { createAdminClient } from '@/lib/supabase/admin'

const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })
/** El enlace del APK dura lo justo para descargarlo (UPD-03) */
const LINK_SECONDS = 15 * 60
const APPS = new Set(['mobile', 'tv'])

/** GET /api/app/latest?app=mobile|tv → la versión más nueva de la app Android (UPD-03) */
export async function GET(request: NextRequest) {
  const app = request.nextUrl.searchParams.get('app') ?? ''
  const { supabase, user } = await requestUser(request)
  if (!user) return json({ error: 'unauthorized' }, 401)
  if (!APPS.has(app)) return json({ error: 'invalid_app' }, 400)

  const { data: release, error } = await supabase
    .from('app_releases')
    .select('version_code, version_name, apk_path, sha256')
    .eq('app', app)
    .order('version_code', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return json({ error: 'server_error' }, 500)
  if (!release) return new NextResponse(null, { status: 204, headers: NO_STORE })

  // El bucket `apps` es privado: solo el servidor firma el enlace (UPD-02)
  const { data: signed } = await createAdminClient().storage.from('apps').createSignedUrl(release.apk_path, LINK_SECONDS)
  if (!signed) return json({ error: 'server_error' }, 500)

  return json({ version_code: release.version_code, version_name: release.version_name, sha256: release.sha256, url: signed.signedUrl })
}
