#!/usr/bin/env node
// Prepara (o limpia) datos en el Supabase LOCAL para la prueba en emulador.
//   node android/scripts/seed-e2e.mjs seed     -> imprime JSON con credenciales e ids
//   node android/scripts/seed-e2e.mjs cleanup '<json>'
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

// Raíz del repo a partir de la ubicación de este archivo (no del directorio actual)
const ROOT = path.resolve(import.meta.dirname, '../..')
const raw = execFileSync(path.join(ROOT, 'node_modules/.bin/supabase'), ['status', '-o', 'json'], { cwd: ROOT }).toString()
const status = JSON.parse(raw.slice(raw.indexOf('{')))
const { hostname } = new URL(status.API_URL)
if (hostname !== '127.0.0.1' && hostname !== 'localhost') throw new Error('Solo Supabase local')
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const [mode, payload] = process.argv.slice(2)

if (mode === 'cleanup') {
  const data = JSON.parse(payload)
  await admin.from('movies').delete().in('id', [data.movieId, data.draftId])
  await admin.auth.admin.deleteUser(data.userId)
  process.exit(0)
}

const tag = randomBytes(3).toString('hex')
const email = `android-e2e-${tag}@example.com`
const password = `pw-${randomBytes(8).toString('hex')}`
const { data: user, error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { password_set: true },
})
if (error) throw error

const { data: movies } = await admin
  .from('movies')
  .insert([
    { slug: `and-e2e-${tag}`, title: `Android E2E ${tag}`, synopsis: 'Película de la prueba en emulador.', release_year: 2026, genres: ['prueba'], duration_seconds: 6000, hls_path: 'sample/master.m3u8', status: 'published' },
    { slug: `and-e2e-draft-${tag}`, title: `Borrador E2E ${tag}`, genres: [], duration_seconds: 100, hls_path: 'sample/master.m3u8', status: 'draft' },
  ])
  .select('id, status, title')
  .then(({ data, error }) => {
    if (error) throw new Error(`No se pudieron crear las películas: ${error.message}`)
    return { data }
  })
const movie = movies.find((m) => m.status === 'published')
const draft = movies.find((m) => m.status === 'draft')
await admin.from('watch_progress').insert({ user_id: user.user.id, movie_id: movie.id, position_seconds: 754 })

console.log(JSON.stringify({ email, password, userId: user.user.id, movieId: movie.id, movieTitle: movie.title, draftId: draft.id, draftTitle: draft.title }))
