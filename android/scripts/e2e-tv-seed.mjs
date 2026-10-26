// Datos para scripts/e2e-tv.sh, SOLO en el Supabase local.
//   seed <archivo>              usuario + película publicada con el HLS de prueba
//   approve <archivo> <código>  aprueba el código como lo haría /link desde el teléfono
//   progress <archivo>          posición guardada (o 0)
//   cleanup <archivo>           borra lo creado
//   env <puerto>                variables para la web local que ve la tele (10.0.2.2)
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const root = path.resolve(import.meta.dirname, '../..')
const status = JSON.parse(execSync('node_modules/.bin/supabase status -o json 2>/dev/null', { cwd: root }).toString())
if (!/127\.0\.0\.1|localhost/.test(status.API_URL)) throw new Error('Solo Supabase local')
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const [cmd, file, arg] = process.argv.slice(2)
const tag = Date.now()

if (cmd === 'env') {
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: status.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    NEXT_PUBLIC_SITE_URL: `http://10.0.2.2:${file}`,
    VIDEO_CDN_URL: 'http://10.0.2.2:3101',
    VIDEO_TOKEN_SECRET: 'test-video-token-secret-0123456789abcdef',
    NEXT_DIST_DIR: '.next-e2e',
  }
  for (const [k, v] of Object.entries(env)) console.log(`export ${k}=${JSON.stringify(v)}`)
} else if (cmd === 'seed') {
  const { data: u, error } = await admin.auth.admin.createUser({
    email: `tv-e2e-${tag}@example.com`, password: `pw-${tag}-x`, email_confirm: true, user_metadata: { password_set: true },
  })
  if (error) throw error
  const { data: m, error: e2 } = await admin.from('movies').insert({
    slug: `tv-e2e-${tag}`, title: 'TV Prueba Real', synopsis: 'Video HLS real de 12 s.', duration_seconds: 12,
    hls_path: 'sample/master.m3u8', status: 'published', release_year: 2026, genres: ['prueba'], published_at: new Date().toISOString(),
  }).select('id').single()
  if (e2) throw e2
  writeFileSync(file, JSON.stringify({ userId: u.user.id, movieId: m.id }))
} else {
  const seed = JSON.parse(readFileSync(file, 'utf8'))
  if (cmd === 'approve') {
    const { data, error } = await admin.from('device_codes')
      .update({ status: 'approved', user_id: seed.userId, decided_at: new Date().toISOString() })
      .eq('user_code', arg.replace('-', '')).eq('status', 'pending').select('id')
    if (error || data.length !== 1) throw new Error(`No se pudo aprobar ${arg}: ${error?.message ?? 'no está pendiente'}`)
  } else if (cmd === 'progress') {
    const { data } = await admin.from('watch_progress').select('position_seconds').eq('user_id', seed.userId).eq('movie_id', seed.movieId).maybeSingle()
    console.log(data?.position_seconds ?? 0)
  } else if (cmd === 'cleanup') {
    await admin.from('movies').delete().eq('id', seed.movieId)
    await admin.auth.admin.deleteUser(seed.userId)
  }
}
