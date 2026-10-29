// Datos para las pruebas de la app del iPad, SOLO en el Supabase local.
//   seed <archivo>     usuario + película + serie con episodios (con imágenes del bucket local)
//   cleanup <archivo>  borra lo creado
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

const root = path.resolve(import.meta.dirname, '../..')
const status = JSON.parse(execSync('node_modules/.bin/supabase status -o json 2>/dev/null', { cwd: root }).toString())
if (!/127\.0\.0\.1|localhost/.test(status.API_URL)) throw new Error('Solo Supabase local')
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const [cmd, file] = process.argv.slice(2)
const tag = Date.now()

async function image(name, width, height, color) {
  const bytes = await sharp({ create: { width, height, channels: 3, background: color } }).webp().toBuffer()
  const key = `ipad-${tag}-${name}.webp`
  await admin.storage.from('posters').upload(key, bytes, { contentType: 'image/webp', upsert: true })
  return admin.storage.from('posters').getPublicUrl(key).data.publicUrl
}

if (cmd === 'seed') {
  const password = `pw-${tag}-ipad`
  const { data: u, error } = await admin.auth.admin.createUser({ email: `ipad-${tag}@example.com`, password, email_confirm: true, user_metadata: { password_set: true } })
  if (error) throw error
  const { data: m } = await admin.from('movies').insert({
    slug: `ipad-peli-${tag}`, title: 'Película iPad', synopsis: 'Una película de prueba.', duration_seconds: 12, hls_path: 'sample/master.m3u8',
    status: 'published', release_year: 2026, genres: ['prueba'], poster_image_url: await image('poster', 400, 600, '#7a2a2a'),
  }).select('id').single()
  const { data: s } = await admin.from('series').insert({
    slug: `ipad-serie-${tag}`, title: 'Serie iPad', synopsis: 'Una serie de prueba con dos temporadas.', release_year: 2024, genres: ['prueba'],
    status: 'published', poster_image_url: await image('sposter', 400, 600, '#2a3a7a'), backdrop_image_url: await image('backdrop', 1280, 720, '#5a3aa0'),
  }).select('id').single()
  const still = await image('still', 640, 360, '#2a6a5a')
  const eps = [[1, 1, 'Piloto'], [1, 2, 'El segundo'], [2, 1, 'Nueva temporada']].map(([season, n, title]) => ({
    slug: `ipad-serie-${tag}-s0${season}e0${n}`, title, synopsis: `Sinopsis de ${title}.`, duration_seconds: 12, hls_path: 'sample/master.m3u8',
    status: 'published', series_id: s.id, season_number: season, episode_number: n, poster_image_url: still,
  }))
  const { data: e } = await admin.from('movies').insert(eps).select('id, slug')
  const e1 = e.find((x) => x.slug.endsWith('s01e01')).id
  // T1:E1 terminado → "Seguir viendo" ofrece T1:E2
  await admin.from('watch_progress').insert({ user_id: u.user.id, movie_id: e1, position_seconds: 12 })
  writeFileSync(file, JSON.stringify({ userId: u.user.id, email: u.user.email, password, movieId: m.id, seriesId: s.id }))
  console.log(JSON.stringify({ email: u.user.email }))
} else if (cmd === 'cleanup') {
  const seed = JSON.parse(readFileSync(file, 'utf8'))
  await admin.from('series').delete().eq('id', seed.seriesId)
  await admin.from('movies').delete().eq('id', seed.movieId)
  await admin.auth.admin.deleteUser(seed.userId)
}
