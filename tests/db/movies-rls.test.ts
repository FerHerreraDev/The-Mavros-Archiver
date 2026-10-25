import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { adminClient, anonClient, createUser, deleteUsers, signedInClient, type TestUser } from '../helpers/users'

// Clientes con la clave pública + sesión: exactamente lo que tendrá la app Android (supabase-kt)
let viewer: TestUser
let boss: TestUser
let asViewer: SupabaseClient
let asBoss: SupabaseClient
let publishedId: string
let draftId: string
const createdMovies: string[] = []

const uniq = () => Math.random().toString(36).slice(2, 8)
const movie = (overrides: Record<string, unknown> = {}) => ({
  slug: `test-${uniq()}`,
  title: 'Película de prueba',
  duration_seconds: 120,
  hls_path: 'movies/test/master.m3u8',
  ...overrides,
})

async function insertAsService(overrides: Record<string, unknown> = {}) {
  const { data, error } = await adminClient().from('movies').insert(movie(overrides)).select('id').single()
  if (error) throw error
  createdMovies.push(data.id)
  return data.id as string
}

beforeAll(async () => {
  ;[viewer, boss] = await Promise.all([createUser({ prefix: 'viewer' }), createUser({ role: 'admin', prefix: 'boss' })])
  ;[asViewer, asBoss] = await Promise.all([signedInClient(viewer), signedInClient(boss)])
  publishedId = await insertAsService({ status: 'published', title: 'Publicada' })
  draftId = await insertAsService({ status: 'draft', title: 'Borrador' })
})

afterAll(async () => {
  await adminClient().from('movies').delete().in('id', createdMovies)
  await deleteUsers([viewer.id, boss.id])
})

async function exists(id: string) {
  const { data } = await adminClient().from('movies').select('id, title, status').eq('id', id).maybeSingle()
  return data
}

describe('movies: lectura', () => {
  it('MOV-01 un usuario ve la publicada', async () => {
    const { data } = await asViewer.from('movies').select('id').eq('id', publishedId)
    expect(data?.map((m) => m.id)).toEqual([publishedId])
  })

  it('MOV-01 un usuario NO ve borradores (por id, por slug ni listando)', async () => {
    const byId = await asViewer.from('movies').select('id').eq('id', draftId)
    expect(byId.data).toEqual([])

    const { data: draft } = await adminClient().from('movies').select('slug').eq('id', draftId).single()
    const bySlug = await asViewer.from('movies').select('id').eq('slug', draft!.slug)
    expect(bySlug.data).toEqual([])

    const all = await asViewer.from('movies').select('id, status')
    expect(all.data?.every((m) => m.status === 'published')).toBe(true)
  })

  it('MOV-02 un admin ve también borradores', async () => {
    const { data } = await asBoss.from('movies').select('id').in('id', [publishedId, draftId])
    expect(data?.map((m) => m.id).sort()).toEqual([publishedId, draftId].sort())
  })

  it('MOV-03 un anónimo no ve ninguna, ni publicadas', async () => {
    const { data } = await anonClient().from('movies').select('id').in('id', [publishedId, draftId])
    expect(data ?? []).toEqual([])
  })
})

describe('movies: escritura (MOV-04)', () => {
  it('un usuario no puede crear', async () => {
    const slug = `hack-${uniq()}`
    const { error } = await asViewer.from('movies').insert(movie({ slug }))
    expect(error).not.toBeNull()
    const { data } = await adminClient().from('movies').select('id').eq('slug', slug)
    expect(data).toEqual([])
  })

  it('un usuario no puede editar ni publicar un borrador', async () => {
    await asViewer.from('movies').update({ title: 'hackeada', status: 'published' }).eq('id', draftId)
    expect(await exists(draftId)).toMatchObject({ title: 'Borrador', status: 'draft' })
  })

  it('un usuario no puede editar una publicada', async () => {
    await asViewer.from('movies').update({ title: 'hackeada' }).eq('id', publishedId)
    expect((await exists(publishedId))?.title).toBe('Publicada')
  })

  it('un usuario no puede borrar', async () => {
    await asViewer.from('movies').delete().eq('id', publishedId)
    expect(await exists(publishedId)).not.toBeNull()
  })

  it('un anónimo no puede crear', async () => {
    const { error } = await anonClient().from('movies').insert(movie())
    expect(error).not.toBeNull()
  })

  it('un admin crea, edita y borra con su sesión (como lo haría Android)', async () => {
    const { data, error } = await asBoss.from('movies').insert(movie({ title: 'Del admin' })).select('id, created_by').single()
    expect(error).toBeNull()
    createdMovies.push(data!.id)

    const upd = await asBoss.from('movies').update({ title: 'Editada' }).eq('id', data!.id).select('title').single()
    expect(upd.data?.title).toBe('Editada')

    const del = await asBoss.from('movies').delete().eq('id', data!.id).select('id')
    expect(del.data).toHaveLength(1)
    expect(await exists(data!.id)).toBeNull()
  })
})

describe('movies: integridad (MOV-05)', () => {
  it.each([
    ['slug con espacios', { slug: 'con espacios' }],
    ['slug con mayúsculas', { slug: 'Mayus' }],
    ['título vacío', { title: '   ' }],
    ['año 1887', { release_year: 1887 }],
    ['año 2101', { release_year: 2101 }],
    ['duración 0', { duration_seconds: 0 }],
    ['hls_path absoluto http', { hls_path: 'https://evil.com/master.m3u8' }],
    ['hls_path con /', { hls_path: '/movies/x/master.m3u8' }],
    ['hls_path con ..', { hls_path: 'movies/../x/master.m3u8' }],
    ['hls_path no m3u8', { hls_path: 'movies/x/video.mp4' }],
    ['póster http', { poster_url: 'http://inseguro.com/p.jpg' }],
    ['estado inválido', { status: 'archived' }],
  ])('rechaza %s', async (_label, overrides) => {
    const { error } = await asBoss.from('movies').insert(movie(overrides))
    expect(error).not.toBeNull()
  })

  it('slug único', async () => {
    const slug = `dup-${uniq()}`
    await insertAsService({ slug })
    const { error } = await asBoss.from('movies').insert(movie({ slug }))
    expect(error?.code).toBe('23505')
  })
})

describe('movies: automáticos (MOV-06)', () => {
  it('created_by es el admin que crea, aunque mande otro id', async () => {
    const { data } = await asBoss
      .from('movies')
      .insert(movie({ created_by: viewer.id }))
      .select('id, created_by')
      .single()
    createdMovies.push(data!.id)
    expect(data!.created_by).toBe(boss.id)

    // y no se puede reasignar después
    await asBoss.from('movies').update({ created_by: viewer.id }).eq('id', data!.id)
    const { data: after } = await adminClient().from('movies').select('created_by').eq('id', data!.id).single()
    expect(after!.created_by).toBe(boss.id)
  })

  it('published_at se fija al publicar y se borra al volver a borrador; updated_at avanza', async () => {
    const id = await insertAsService({ status: 'draft' })
    const before = (await adminClient().from('movies').select('published_at, updated_at').eq('id', id).single()).data!
    expect(before.published_at).toBeNull()

    await new Promise((r) => setTimeout(r, 20))
    await asBoss.from('movies').update({ status: 'published' }).eq('id', id)
    const published = (await adminClient().from('movies').select('published_at, updated_at').eq('id', id).single()).data!
    expect(published.published_at).not.toBeNull()
    expect(new Date(published.updated_at) > new Date(before.updated_at)).toBe(true)

    await asBoss.from('movies').update({ status: 'draft' }).eq('id', id)
    const draft = (await adminClient().from('movies').select('published_at').eq('id', id).single()).data!
    expect(draft.published_at).toBeNull()
  })

  it('published_at no se puede falsificar al crear un borrador', async () => {
    const { data } = await asBoss
      .from('movies')
      .insert(movie({ status: 'draft', published_at: '2000-01-01T00:00:00Z' }))
      .select('id, published_at')
      .single()
    createdMovies.push(data!.id)
    expect(data!.published_at).toBeNull()
  })
})
