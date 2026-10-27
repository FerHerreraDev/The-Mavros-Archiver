import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  createPlaylistAction,
  deletePlaylistAction,
  movePlaylistItemAction,
  removePlaylistItemAction,
  renamePlaylistAction,
  togglePlaylistItemAction,
} from '@/lib/actions/playlist.actions'
import { getPlaylist, listPlaylists, nextFromPlaylist, playlistMembership } from '@/lib/data/playlists'
import { resetRequest } from '../helpers/request-context'
import { adminClient, createUser, deleteUsers, randomIp, sessionCookies, type TestUser } from '../helpers/users'

let ana: TestUser
let beto: TestUser
const tag = Math.random().toString(36).slice(2, 8)
const ids: Record<string, string> = {}

async function as(user: TestUser | null) {
  resetRequest({ ip: randomIp(), cookies: user ? await sessionCookies(user) : undefined })
}

async function movie(key: string, fields: Record<string, unknown> = {}) {
  const { data, error } = await adminClient()
    .from('movies')
    .insert({ slug: `pli-${key}-${tag}`, title: `Peli ${key}`, duration_seconds: 1000, hls_path: 'ladder/master.m3u8', status: 'published', ...fields })
    .select('id')
    .single()
  if (error) throw error
  ids[key] = data.id
}

beforeAll(async () => {
  ;[ana, beto] = await Promise.all([createUser({ prefix: 'pli-ana' }), createUser({ prefix: 'pli-beto' })])
  await movie('m1')
  await movie('m2')
  await movie('draft', { status: 'draft' })
  const { data: show } = await adminClient().from('series').insert({ slug: `pli-serie-${tag}`, title: 'Serie lista', status: 'published' }).select('id').single()
  ids.show = show!.id
  await movie('e1', { series_id: ids.show, season_number: 1, episode_number: 1 })
  await movie('e2', { series_id: ids.show, season_number: 1, episode_number: 2 })
})

afterAll(async () => {
  await adminClient().from('series').delete().eq('id', ids.show)
  await adminClient().from('movies').delete().like('slug', `pli-%-${tag}`)
  await deleteUsers([ana.id, beto.id])
})

describe('listas desde la web (PL-03, PL-04)', () => {
  it('crear, ver con su cuenta, renombrar y borrar; nombres inválidos dan error claro', async () => {
    await as(ana)
    expect((await createPlaylistAction({ name: '   ' })).error).toMatch(/nombre/i)
    expect((await createPlaylistAction({ name: 'x'.repeat(101) })).error).toMatch(/100/)

    const created = await createPlaylistAction({ name: '  Para el finde  ' })
    expect(created.success).toMatch(/creada/)
    const mine = await listPlaylists()
    expect(mine.find((l) => l.id === created.id)).toMatchObject({ name: 'Para el finde', count: 0 })

    expect((await renamePlaylistAction({ id: created.id!, name: 'Cine' })).success).toBeTruthy()
    expect((await listPlaylists()).find((l) => l.id === created.id)?.name).toBe('Cine')

    expect((await deletePlaylistAction({ id: created.id! })).success).toMatch(/borrada/)
    expect((await listPlaylists()).some((l) => l.id === created.id)).toBe(false)
  })

  it('agregar a lista: marca en cuáles está, tocar agrega o quita, y crear una nueva ya lo agrega', async () => {
    await as(ana)
    const a = await createPlaylistAction({ name: 'A' })
    const b = await createPlaylistAction({ name: 'B', add: { movieId: ids.m1 } })

    let membership = await playlistMembership({ movieId: ids.m1 })
    expect(membership.find((l) => l.id === a.id)?.contains).toBe(false)
    expect(membership.find((l) => l.id === b.id)?.contains).toBe(true)

    expect((await togglePlaylistItemAction({ playlistId: a.id!, target: { movieId: ids.m1 } })).success).toMatch(/agregado/i)
    membership = await playlistMembership({ movieId: ids.m1 })
    expect(membership.find((l) => l.id === a.id)?.contains).toBe(true)

    expect((await togglePlaylistItemAction({ playlistId: a.id!, target: { movieId: ids.m1 } })).success).toMatch(/quitado/i)
    expect((await playlistMembership({ movieId: ids.m1 })).find((l) => l.id === a.id)?.contains).toBe(false)

    // Series también
    await togglePlaylistItemAction({ playlistId: a.id!, target: { seriesId: ids.show } })
    expect((await playlistMembership({ seriesId: ids.show })).find((l) => l.id === a.id)?.contains).toBe(true)

    // Un borrador no se puede agregar
    expect((await togglePlaylistItemAction({ playlistId: a.id!, target: { movieId: ids.draft } })).error).toBeTruthy()
  })

  it('otra persona no ve mi lista ni puede tocarla; un anónimo tampoco', async () => {
    await as(ana)
    const mine = await createPlaylistAction({ name: 'Privada', add: { movieId: ids.m1 } })
    await as(beto)
    expect(await getPlaylist(mine.id!)).toBeNull()
    expect((await listPlaylists()).some((l) => l.id === mine.id)).toBe(false)
    expect((await renamePlaylistAction({ id: mine.id!, name: 'Hack' })).error).toBeTruthy()
    expect((await deletePlaylistAction({ id: mine.id! })).error).toBeTruthy()
    expect((await togglePlaylistItemAction({ playlistId: mine.id!, target: { movieId: ids.m2 } })).error).toBeTruthy()
    await as(null)
    expect((await createPlaylistAction({ name: 'Anon' })).error).toMatch(/sesión/)
    await as(ana)
    expect((await getPlaylist(mine.id!))!.items).toHaveLength(1)
  })
})

describe('página de la lista y reproducirla (PL-05, PL-06)', () => {
  it('orden, mover, quitar, reproducir desde el primero y lo que sigue', async () => {
    await as(ana)
    const list = await createPlaylistAction({ name: 'Maratón', add: { movieId: ids.m1 } })
    await togglePlaylistItemAction({ playlistId: list.id!, target: { seriesId: ids.show } })
    await togglePlaylistItemAction({ playlistId: list.id!, target: { movieId: ids.m2 } })

    let page = await getPlaylist(list.id!)
    const order = () => page!.items.map((i) => i.movie?.id ?? i.series?.id)
    expect(order()).toEqual([ids.m1, ids.show, ids.m2])
    expect(page!.start?.episode.id).toBe(ids.m1)

    // Siguiente: película → serie (su primer episodio) → siguiente episodio → película → nada
    expect((await nextFromPlaylist(list.id!, ids.m1))?.next.id).toBe(ids.e1)
    expect((await nextFromPlaylist(list.id!, ids.e1))?.next.id).toBe(ids.e2)
    expect((await nextFromPlaylist(list.id!, ids.e2))?.next.id).toBe(ids.m2)
    expect(await nextFromPlaylist(list.id!, ids.m2)).toBeNull()

    // Mover la última arriba dos veces → primera
    const last = page!.items[2].id
    await movePlaylistItemAction({ playlistId: list.id!, itemId: last, direction: 'up' })
    await movePlaylistItemAction({ playlistId: list.id!, itemId: last, direction: 'up' })
    page = await getPlaylist(list.id!)
    expect(order()).toEqual([ids.m2, ids.m1, ids.show])
    // Mover el primero arriba no hace nada
    expect(await movePlaylistItemAction({ playlistId: list.id!, itemId: last, direction: 'up' })).toEqual({})

    await removePlaylistItemAction({ playlistId: list.id!, itemId: page!.items[0].id })
    page = await getPlaylist(list.id!)
    expect(order()).toEqual([ids.m1, ids.show])
  })

  it('lo que deja de estar publicado no aparece; otra lista no da siguiente', async () => {
    await as(ana)
    await movie('temp')
    const list = await createPlaylistAction({ name: 'Temp', add: { movieId: ids.temp } })
    await togglePlaylistItemAction({ playlistId: list.id!, target: { movieId: ids.m1 } })
    await adminClient().from('movies').update({ status: 'draft' }).eq('id', ids.temp)
    const page = await getPlaylist(list.id!)
    expect(page!.items.map((i) => i.movie?.id)).toEqual([ids.m1])
    expect(page!.start?.episode.id).toBe(ids.m1)

    await as(beto)
    expect(await nextFromPlaylist(list.id!, ids.m1)).toBeNull()
  })
})
