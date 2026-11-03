#!/usr/bin/env node
// Completa lo que ya está en el catálogo con los datos nuevos de TMDB (TMDB-08): imagen horizontal,
// logo, tráiler, reparto y color. Igual que siempre, solo llena lo vacío: nunca pisa lo que escribiste.
// Las que no tienen id de TMDB se buscan por título y año (el primer resultado, como la carpeta).
//
//   pnpm tmdb:completar            # películas y series (no episodios)
//   pnpm tmdb:completar --dry-run  # solo dice qué haría
import { createTmdb, fillEmpty } from '../lib/tmdb/client.mjs'
import { accentColor } from '../lib/poster/image.mjs'
import { downloadImage, tmdbImageFields } from './movie-inbox-tmdb.mjs'
import { readEnv, supabaseAdmin } from './movie-inbox.mjs'

const EXTRAS = ['backdrop_url', 'logo_url', 'trailer_key', 'cast']
const TABLES = [
  { table: 'movies', kind: 'movie', label: 'película' },
  { table: 'series', kind: 'tv', label: 'serie' },
]

/** Campos a escribir en una fila ({} si no hay nada nuevo); null si TMDB no la encuentra */
export async function completeRow(db, tmdb, kind, row, { dryRun = false } = {}) {
  let tmdbId = row.tmdb_id
  if (!tmdbId) {
    const hit = (await tmdb.search(kind, row.title, row.release_year))[0]
    if (!hit) return null
    tmdbId = hit.tmdbId
  }
  const details = kind === 'movie' ? await tmdb.movie(tmdbId) : await tmdb.series(tmdbId)
  if (!details) return null

  const updates = fillEmpty(row, Object.fromEntries(EXTRAS.map((k) => [k, details[k]])))
  if (!row.tmdb_id) updates.tmdb_id = tmdbId
  if (dryRun) return updates

  Object.assign(updates, await tmdbImageFields(db, updates))
  // Ya tenía imagen horizontal (p. ej. una serie) pero no color
  const backdrop = row.backdrop_image_url ?? row.backdrop_url
  if (!row.accent_color && !updates.accent_color && !updates.backdrop_url && backdrop) {
    const bytes = await downloadImage(backdrop)
    const color = bytes ? await accentColor(bytes) : null
    if (color) updates.accent_color = color
  }
  return updates
}

/** [ids]: solo esas filas (pruebas) */
export async function backfill(db, tmdb, { dryRun = false, log = console.log, ids } = {}) {
  const summary = { updated: 0, unchanged: 0, missing: 0, failed: 0 }
  for (const { table, kind, label } of TABLES) {
    let query = db.from(table).select('*').order('created_at')
    if (table === 'movies') query = query.is('series_id', null)
    if (ids) query = query.in('id', ids)
    const { data: rows, error } = await query
    if (error) throw new Error(`${table}: ${error.message}`)
    for (const row of rows) {
      try {
        const updates = await completeRow(db, tmdb, kind, row, { dryRun })
        if (updates === null) {
          summary.missing++
          log(`– ${row.title}: TMDB no encontró la ${label}`)
          continue
        }
        const fields = Object.keys(updates)
        if (!fields.length) {
          summary.unchanged++
          continue
        }
        if (!dryRun) {
          const { error: saveError } = await db.from(table).update(updates).eq('id', row.id)
          if (saveError) throw new Error(saveError.message)
        }
        summary.updated++
        log(`✓ ${row.title}: ${fields.filter((f) => !f.endsWith('_thumbhash')).join(', ')}`)
      } catch (err) {
        summary.failed++
        log(`✗ ${row.title}: ${err.message}`)
      }
    }
  }
  return summary
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const env = readEnv()
  const tmdb = createTmdb({ ...env, ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('TMDB_'))) })
  if (!tmdb) throw new Error('Falta TMDB_API_KEY en .env.local')
  const s = await backfill(supabaseAdmin(env), tmdb, { dryRun })
  console.log(`\n${dryRun ? '(prueba, sin guardar) ' : ''}${s.updated} completadas · ${s.unchanged} ya estaban · ${s.missing} sin resultado · ${s.failed} con error`)
  if (s.failed) process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
