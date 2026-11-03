import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTmdb } from '@/lib/tmdb/client.mjs'
import { backfill } from '../../scripts/tmdb-backfill.mjs'
import { adminClient } from '../helpers/users'
import { startFakeTmdb, tmdbFixtures } from '../helpers/fake-tmdb'

// TMDB-08: completar lo que ya estaba en el catálogo con los datos nuevos (sin pisar nada)
const tag = Math.random().toString(36).slice(2, 8)
const SHOW = 1396
const MOVIE = 149
let fake: Awaited<ReturnType<typeof startFakeTmdb>>
const ids: Record<string, string> = {}

beforeAll(async () => {
  fake = await startFakeTmdb(tmdbFixtures(SHOW, MOVIE))
  const movie = (slug: string, fields: Record<string, unknown>) =>
    adminClient()
      .from('movies')
      .insert({ slug: `${slug}-${tag}`, duration_seconds: 10, hls_path: 'ladder/master.m3u8', ...fields })
      .select('id')
      .single()
  const [linked, unlinked, written, show] = await Promise.all([
    movie('bf-linked', { title: 'Con id', tmdb_id: MOVIE }),
    movie('bf-unlinked', { title: 'Peli TMDB', release_year: 1988 }),
    movie('bf-written', { title: 'Escrita', tmdb_id: MOVIE, trailer_key: 'miTrailer01', backdrop_url: 'https://mia.example/b.jpg' }),
    adminClient().from('series').insert({ slug: `bf-serie-${tag}`, title: 'Serie', tmdb_id: SHOW }).select('id').single(),
  ])
  Object.assign(ids, { linked: linked.data!.id, unlinked: unlinked.data!.id, written: written.data!.id, show: show.data!.id })
})

afterAll(async () => {
  await adminClient().from('movies').delete().like('slug', `bf-%-${tag}`)
  await adminClient().from('series').delete().eq('slug', `bf-serie-${tag}`)
  await fake.close()
})

const tmdb = () => createTmdb({ TMDB_API_KEY: 'clave-de-prueba', TMDB_API_URL: fake.url, TMDB_IMAGE_URL: 'https://image.invalid/t/p' })!
const row = async (table: string, id: string) => (await adminClient().from(table).select('*').eq('id', id).single()).data!

describe('pnpm tmdb:completar (TMDB-08)', () => {
  it('--dry-run no guarda nada', async () => {
    const log: string[] = []
    const summary = await backfill(adminClient(), tmdb(), { dryRun: true, ids: Object.values(ids), log: (m: string) => log.push(m) })
    expect(summary.updated).toBe(4)
    expect((await row('movies', ids.linked)).trailer_key).toBeNull()
  })

  it('llena imagen horizontal, logo, tráiler y reparto; busca las que no tienen id; nunca pisa lo escrito', async () => {
    const summary = await backfill(adminClient(), tmdb(), { ids: Object.values(ids), log: () => {} })
    expect(summary).toMatchObject({ updated: 4, failed: 0 })

    const extras = {
      backdrop_url: 'https://image.invalid/t/p/w1280/mb.jpg',
      logo_url: 'https://image.invalid/t/p/w500/ml.png',
      trailer_key: 'akiraTrail1',
      cast: [{ name: 'Mitsuo Iwata', character: 'Kaneda', profile_url: 'https://image.invalid/t/p/w185/mi.jpg' }],
    }
    expect(await row('movies', ids.linked)).toMatchObject({ title: 'Con id', ...extras })
    // Sin id: lo encuentra por título y año y lo guarda; lo demás (sinopsis, géneros) no lo toca
    expect(await row('movies', ids.unlinked)).toMatchObject({ ...extras, tmdb_id: MOVIE, synopsis: null, genres: [] })
    expect(await row('movies', ids.written)).toMatchObject({ trailer_key: 'miTrailer01', backdrop_url: 'https://mia.example/b.jpg', logo_url: extras.logo_url })
    expect(await row('series', ids.show)).toMatchObject({ backdrop_url: 'https://image.invalid/t/p/w1280/sb.jpg' })
  })

  it('una segunda vez ya no hay nada que llenar', async () => {
    const summary = await backfill(adminClient(), tmdb(), { ids: Object.values(ids), log: () => {} })
    expect(summary).toMatchObject({ updated: 0, unchanged: 4 })
  })
})
