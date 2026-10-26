import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import type { Server } from 'node:http'
import { createMovieAction, updateMovieAction } from '@/lib/actions/movie.actions'
import { thumbhashFromImage } from '@/lib/poster/thumbhash'
import { resetRequest, runAndCaptureRedirect, formData } from '../helpers/request-context'
import { adminClient, createUser, deleteUsers, randomIp, sessionCookies, type TestUser } from '../helpers/users'
import { startVideoCdn, TEST_VIDEO_SECRET } from '../helpers/video-cdn-server'

// LOAD-03 de punta a punta (acción → sharp → base de datos). Lo único simulado es la descarga:
// las reglas de red (LOAD-05) se prueban en tests/unit/poster-fetch.test.ts.
const POSTERS = path.join(__dirname, '../fixtures/posters')
vi.mock('@/lib/poster/fetch-poster', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/poster/fetch-poster')>()
  return {
    ...real,
    fetchPosterBytes: vi.fn(async (url: string) => {
      const name = url.match(/^https:\/\/posters\.test\/(.+)$/)?.[1]
      if (!name) throw new real.PosterFetchError('No se pudo descargar el póster')
      return readFileSync(path.join(POSTERS, name))
    }),
  }
})

let server: Server
let boss: TestUser
const expected = () => thumbhashFromImage(readFileSync(path.join(POSTERS, 'red-blue-2x3.png')))

beforeAll(async () => {
  server = await startVideoCdn(path.join(__dirname, '../fixtures/hls'), TEST_VIDEO_SECRET)
  const { port } = server.address() as { port: number }
  vi.stubEnv('VIDEO_CDN_URL', `http://127.0.0.1:${port}`)
  vi.stubEnv('VIDEO_TOKEN_SECRET', TEST_VIDEO_SECRET)
  boss = await createUser({ role: 'admin', prefix: 'thumb-boss' })
})

afterAll(async () => {
  await adminClient().from('movies').delete().like('slug', 'it-thumb-%')
  await deleteUsers([boss.id])
  vi.unstubAllEnvs()
  server.close()
})

const uniq = () => Math.random().toString(36).slice(2, 8)
const fields = (overrides: Record<string, string>) =>
  formData({
    title: 'Póster IT',
    slug: `it-thumb-${uniq()}`,
    original_title: '',
    synopsis: '',
    release_year: '2025',
    genres: 'Anime',
    poster_url: '',
    hls_path: 'ladder/master.m3u8',
    ...overrides,
  })
const bySlug = async (slug: string) =>
  (await adminClient().from('movies').select('id, poster_url, poster_thumbhash').eq('slug', slug).single()).data!

async function create(overrides: Record<string, string>) {
  resetRequest({ ip: randomIp(), cookies: await sessionCookies(boss) })
  const fd = fields(overrides)
  const { redirect } = await runAndCaptureRedirect(() => createMovieAction(fd))
  return { redirect, slug: String(fd.get('slug')) }
}

describe('LOAD-03 ThumbHash al guardar', () => {
  it('crear con póster → guarda el ThumbHash de esa imagen', async () => {
    const { redirect, slug } = await create({ poster_url: 'https://posters.test/red-blue-2x3.png' })
    expect(redirect).toBe('/dashboard/admin/movies')
    expect((await bySlug(slug)).poster_thumbhash).toBe(await expected())
  })

  it('póster que no se puede leer → la película se guarda igual, sin vista previa', async () => {
    const { redirect, slug } = await create({ poster_url: 'https://caido.example.com/p.png' })
    expect(redirect).toBe('/dashboard/admin/movies')
    expect(await bySlug(slug)).toMatchObject({ poster_url: 'https://caido.example.com/p.png', poster_thumbhash: null })
  })

  it('sin póster → sin vista previa', async () => {
    const { slug } = await create({})
    expect((await bySlug(slug)).poster_thumbhash).toBeNull()
  })

  it('editar: cambiar el póster recalcula; quitarlo borra la vista previa', async () => {
    const { slug } = await create({ poster_url: 'https://caido.example.com/p.png' })
    const { id } = await bySlug(slug)

    resetRequest({ ip: randomIp(), cookies: await sessionCookies(boss) })
    await runAndCaptureRedirect(() => updateMovieAction(id, fields({ slug, poster_url: 'https://posters.test/red-blue-2x3.jpg' })))
    const jpgHash = await thumbhashFromImage(readFileSync(path.join(POSTERS, 'red-blue-2x3.jpg')))
    expect((await bySlug(slug)).poster_thumbhash).toBe(jpgHash)

    resetRequest({ ip: randomIp(), cookies: await sessionCookies(boss) })
    await runAndCaptureRedirect(() => updateMovieAction(id, fields({ slug, poster_url: '' })))
    expect(await bySlug(slug)).toMatchObject({ poster_url: null, poster_thumbhash: null })
  })

  it('un formulario no puede inyectar su propio poster_thumbhash', async () => {
    const { slug } = await create({ poster_url: '', poster_thumbhash: 'AAAAAAAAAAAAAAAAAAAA' })
    expect((await bySlug(slug)).poster_thumbhash).toBeNull()
  })
})
