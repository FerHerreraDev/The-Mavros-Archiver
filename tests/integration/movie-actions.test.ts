import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import path from 'node:path'
import type { Server } from 'node:http'
import {
  createMovieAction,
  updateMovieAction,
  setMovieStatusAction,
  deleteMovieAction,
} from '@/lib/actions/movie.actions'
import { listMoviesForAdmin } from '@/lib/data/movies'
import { resetRequest, runAndCaptureRedirect, formData } from '../helpers/request-context'
import { adminClient, createUser, deleteUsers, randomIp, sessionCookies, type TestUser } from '../helpers/users'
import { startVideoCdn, TEST_VIDEO_SECRET } from '../helpers/video-cdn-server'

let server: Server
let boss: TestUser
let viewer: TestUser

beforeAll(async () => {
  // Worker de video real sobre un "R2" local con tests/fixtures/hls
  server = await startVideoCdn(path.join(__dirname, '../fixtures/hls'), TEST_VIDEO_SECRET)
  const { port } = server.address() as { port: number }
  vi.stubEnv('VIDEO_CDN_URL', `http://127.0.0.1:${port}`)
  vi.stubEnv('VIDEO_TOKEN_SECRET', TEST_VIDEO_SECRET)
  ;[boss, viewer] = await Promise.all([createUser({ role: 'admin', prefix: 'mov-boss' }), createUser({ prefix: 'mov-viewer' })])
})

afterAll(async () => {
  await adminClient().from('movies').delete().like('slug', 'it-%')
  await deleteUsers([boss.id, viewer.id])
  vi.unstubAllEnvs()
  server.close()
})

async function as(user: TestUser | null) {
  resetRequest({ ip: randomIp(), cookies: user ? await sessionCookies(user) : undefined })
}

const uniq = () => Math.random().toString(36).slice(2, 8)
const fields = (overrides: Record<string, string> = {}) =>
  formData({
    title: 'Película IT',
    slug: `it-${uniq()}`,
    original_title: '',
    synopsis: '',
    release_year: '2025',
    genres: 'Anime, Acción',
    poster_url: '',
    hls_path: 'ladder/master.m3u8',
    ...overrides,
  })

const bySlug = async (slug: string) =>
  (await adminClient().from('movies').select('*').eq('slug', slug).maybeSingle()).data

async function createAsBoss(overrides: Record<string, string> = {}) {
  await as(boss)
  const fd = fields(overrides)
  const { redirect, result } = await runAndCaptureRedirect(() => createMovieAction(fd))
  return { redirect, result, slug: String(fd.get('slug')) }
}

describe('createMovieAction', () => {
  it('MOV-07 / MOV-08 admin crea → borrador con duración de la playlist y created_by; redirige a la lista', async () => {
    const { redirect, slug } = await createAsBoss()
    expect(redirect).toBe('/dashboard/admin/movies')
    const movie = await bySlug(slug)
    expect(movie).toMatchObject({
      status: 'draft',
      duration_seconds: 22,
      release_year: 2025,
      genres: ['anime', 'acción'],
      hls_path: 'ladder/master.m3u8',
      created_by: boss.id,
      published_at: null,
    })
  })

  it('MOV-08 video que no existe → error en hls_path y no se guarda', async () => {
    const { redirect, result, slug } = await createAsBoss({ hls_path: 'no-existe/master.m3u8' })
    expect(redirect).toBeNull()
    expect(result?.fieldErrors?.hls_path?.length).toBeGreaterThan(0)
    expect(await bySlug(slug)).toBeNull()
  })

  it('MOV-08 apuntar a una playlist de medios (no master) → error y no se guarda', async () => {
    const { result, slug } = await createAsBoss({ hls_path: 'ladder/1080p/index.m3u8' })
    expect(result?.fieldErrors?.hls_path?.length).toBeGreaterThan(0)
    expect(await bySlug(slug)).toBeNull()
  })

  it('PLY-09 / PLY-02 video en la raíz del bucket (sin carpeta propia) → error en hls_path, no se guarda', async () => {
    const { result, slug } = await createAsBoss({ hls_path: 'master.m3u8' })
    expect(result?.fieldErrors?.hls_path?.length).toBeGreaterThan(0)
    expect(await bySlug(slug)).toBeNull()
  })

  it('PLY-09 la verificación pasa por el Worker: con otro secreto el video no se puede verificar', async () => {
    vi.stubEnv('VIDEO_TOKEN_SECRET', 'otro-secreto-que-el-worker-no-conoce-123')
    const { result, slug } = await createAsBoss()
    vi.stubEnv('VIDEO_TOKEN_SECRET', TEST_VIDEO_SECRET)
    expect(result?.fieldErrors?.hls_path?.length).toBeGreaterThan(0)
    expect(await bySlug(slug)).toBeNull()
  })

  it('MOV-07 errores de validación por campo, sin guardar', async () => {
    const { result, slug } = await createAsBoss({ title: '', release_year: '1500', poster_url: 'http://x.com/p.jpg' })
    expect(Object.keys(result?.fieldErrors ?? {}).sort()).toEqual(['poster_url', 'release_year', 'title'])
    expect(await bySlug(slug)).toBeNull()
  })

  it('MOV-09 sin slug se genera del título', async () => {
    const title = `IT Auto ${uniq()}`
    await createAsBoss({ title, slug: '' })
    const generated = `it-auto-${title.split(' ').pop()}`
    expect(await bySlug(generated)).toMatchObject({ title })
  })

  it('MOV-09 slug repetido → error claro en slug', async () => {
    const { slug } = await createAsBoss()
    const again = await createAsBoss({ slug })
    expect(again.redirect).toBeNull()
    expect(again.result?.fieldErrors?.slug?.length).toBeGreaterThan(0)
  })
})

describe('updateMovieAction / setMovieStatusAction / deleteMovieAction (MOV-11)', () => {
  it('editar cambia los datos y vuelve a verificar el video', async () => {
    const { slug } = await createAsBoss()
    const movie = await bySlug(slug)

    await as(boss)
    const ok = await runAndCaptureRedirect(() =>
      updateMovieAction(movie!.id, fields({ slug, title: 'Título nuevo', synopsis: 'Sinopsis' }))
    )
    expect(ok.redirect).toBe('/dashboard/admin/movies')
    expect(await bySlug(slug)).toMatchObject({ title: 'Título nuevo', synopsis: 'Sinopsis' })

    await as(boss)
    const bad = await runAndCaptureRedirect(() => updateMovieAction(movie!.id, fields({ slug, hls_path: 'roto/master.m3u8' })))
    expect(bad.result?.fieldErrors?.hls_path?.length).toBeGreaterThan(0)
    expect((await bySlug(slug))!.hls_path).toBe('ladder/master.m3u8')
  })

  it('publicar y despublicar', async () => {
    const { slug } = await createAsBoss()
    const { id } = (await bySlug(slug))!

    await as(boss)
    expect((await setMovieStatusAction({ id, status: 'published' })).success).toBeTruthy()
    expect((await bySlug(slug))!.status).toBe('published')

    expect((await setMovieStatusAction({ id, status: 'draft' })).success).toBeTruthy()
    expect((await bySlug(slug))!.status).toBe('draft')
  })

  it('borrar elimina la fila', async () => {
    const { slug } = await createAsBoss()
    const { id } = (await bySlug(slug))!
    await as(boss)
    expect((await deleteMovieAction({ id })).success).toBeTruthy()
    expect(await bySlug(slug)).toBeNull()
  })

  it('id inexistente o inválido → error, nunca éxito', async () => {
    await as(boss)
    const ghost = crypto.randomUUID()
    for (const r of [
      await setMovieStatusAction({ id: ghost, status: 'published' }),
      await deleteMovieAction({ id: ghost }),
      await setMovieStatusAction({ id: 'no-uuid', status: 'published' }),
      await deleteMovieAction({ id: 'no-uuid' }),
      (await runAndCaptureRedirect(() => updateMovieAction(ghost, fields()))).result!,
    ]) {
      expect(r.success).toBeUndefined()
      expect(r.error).toBeTruthy()
    }
  })

  it('estado fuera de draft/published → error', async () => {
    const { slug } = await createAsBoss()
    const { id } = (await bySlug(slug))!
    await as(boss)
    expect((await setMovieStatusAction({ id, status: 'archived' })).error).toBeTruthy()
    expect((await bySlug(slug))!.status).toBe('draft')
  })
})

describe('MOV-12 anónimos y users no pueden', () => {
  for (const who of ['anónimo', 'user'] as const) {
    it(`${who}: crear, editar, publicar, borrar y listar → error sin cambios`, async () => {
      const { slug } = await createAsBoss()
      const target = (await bySlug(slug))!

      await as(who === 'user' ? viewer : null)
      const newSlug = `it-${uniq()}`
      expect((await runAndCaptureRedirect(() => createMovieAction(fields({ slug: newSlug })))).result?.error).toBeTruthy()
      expect(await bySlug(newSlug)).toBeNull()

      expect((await runAndCaptureRedirect(() => updateMovieAction(target.id, fields({ slug, title: 'hack' })))).result?.error).toBeTruthy()
      expect((await setMovieStatusAction({ id: target.id, status: 'published' })).error).toBeTruthy()
      expect((await deleteMovieAction({ id: target.id })).error).toBeTruthy()
      expect(await listMoviesForAdmin()).toBeNull()

      expect(await bySlug(slug)).toMatchObject({ title: target.title, status: 'draft' })
    })
  }
})
