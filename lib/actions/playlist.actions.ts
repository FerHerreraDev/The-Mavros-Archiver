'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// Todo con la sesión del usuario: RLS garantiza que solo toca sus listas (PL-01, PL-02)
export type PlaylistActionResult = { success?: string; error?: string; id?: string }

const LISTS_PATH = '/dashboard/lists'
const NOT_FOUND = 'Lista no encontrada.'
const Id = z.uuid()
const Name = z.string().trim().min(1, 'Ponle un nombre a la lista.').max(100, 'Nombre: máximo 100 caracteres.')
const Target = z.union([z.object({ movieId: Id }), z.object({ seriesId: Id })])
type Target = z.infer<typeof Target>

const column = (t: Target) => ('movieId' in t ? { movie_id: t.movieId } : { series_id: t.seriesId })

async function session() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  return data.user ? supabase : null
}

function refresh(id?: string) {
  revalidatePath(LISTS_PATH)
  if (id) revalidatePath(`${LISTS_PATH}/${id}`)
  // Los botones "Agregar a lista" de las páginas de ver y de series
  revalidatePath('/dashboard', 'layout')
}

/** Crea una lista; con [add], le agrega eso de una vez (PL-03, PL-04) */
export async function createPlaylistAction(input: { name: string; add?: Target }): Promise<PlaylistActionResult> {
  const supabase = await session()
  if (!supabase) return { error: 'Tu sesión expiró.' }
  const name = Name.safeParse(input.name)
  if (!name.success) return { error: name.error.issues[0].message }
  const add = input.add === undefined ? null : Target.safeParse(input.add)
  if (add && !add.success) return { error: 'Datos inválidos.' }

  const { data, error } = await supabase.from('playlists').insert({ name: name.data }).select('id').single()
  if (error) return { error: 'No se pudo crear la lista.' }
  if (add?.success) {
    const { error: addError } = await supabase.from('playlist_items').insert({ playlist_id: data.id, ...column(add.data) })
    if (addError) return { error: 'Se creó la lista pero no se pudo agregar.', id: data.id }
  }
  refresh(data.id)
  return { success: `Lista "${name.data}" creada.`, id: data.id }
}

export async function renamePlaylistAction(input: { id: string; name: string }): Promise<PlaylistActionResult> {
  const supabase = await session()
  if (!supabase) return { error: 'Tu sesión expiró.' }
  const name = Name.safeParse(input.name)
  if (!name.success) return { error: name.error.issues[0].message }
  if (!Id.safeParse(input.id).success) return { error: NOT_FOUND }

  const { data } = await supabase.from('playlists').update({ name: name.data }).eq('id', input.id).select('id')
  if (!data?.length) return { error: NOT_FOUND }
  refresh(input.id)
  return { success: 'Nombre guardado.' }
}

export async function deletePlaylistAction(input: { id: string }): Promise<PlaylistActionResult> {
  const supabase = await session()
  if (!supabase) return { error: 'Tu sesión expiró.' }
  if (!Id.safeParse(input.id).success) return { error: NOT_FOUND }

  const { data } = await supabase.from('playlists').delete().eq('id', input.id).select('name')
  if (!data?.length) return { error: NOT_FOUND }
  refresh(input.id)
  return { success: `Lista "${data[0].name}" borrada.` }
}

/** Agrega a la lista si no estaba; si ya estaba, la quita (PL-04) */
export async function togglePlaylistItemAction(input: { playlistId: string; target: Target }): Promise<PlaylistActionResult> {
  const supabase = await session()
  if (!supabase) return { error: 'Tu sesión expiró.' }
  const target = Target.safeParse(input.target)
  if (!target.success || !Id.safeParse(input.playlistId).success) return { error: 'Datos inválidos.' }

  const match = column(target.data)
  const [key, value] = Object.entries(match)[0]
  const { data: removed } = await supabase.from('playlist_items').delete().eq('playlist_id', input.playlistId).eq(key, value).select('id')
  if (removed?.length) {
    refresh(input.playlistId)
    return { success: 'Quitado de la lista.' }
  }
  const { error } = await supabase.from('playlist_items').insert({ playlist_id: input.playlistId, ...match })
  if (error) return { error: 'No se pudo agregar a la lista.' }
  refresh(input.playlistId)
  return { success: 'Agregado a la lista.' }
}

export async function removePlaylistItemAction(input: { itemId: string; playlistId: string }): Promise<PlaylistActionResult> {
  const supabase = await session()
  if (!supabase) return { error: 'Tu sesión expiró.' }
  if (!Id.safeParse(input.itemId).success) return { error: 'Datos inválidos.' }

  const { data } = await supabase.from('playlist_items').delete().eq('id', input.itemId).select('id')
  if (!data?.length) return { error: 'No se encontró en la lista.' }
  refresh(input.playlistId)
  return { success: 'Quitado de la lista.' }
}

/** Cambia de lugar con el de arriba o el de abajo (PL-05) */
export async function movePlaylistItemAction(input: { playlistId: string; itemId: string; direction: 'up' | 'down' }): Promise<PlaylistActionResult> {
  const supabase = await session()
  if (!supabase) return { error: 'Tu sesión expiró.' }
  if (!Id.safeParse(input.playlistId).success || !Id.safeParse(input.itemId).success) return { error: 'Datos inválidos.' }

  const { data: items } = await supabase.from('playlist_items').select('id, position').eq('playlist_id', input.playlistId).order('position')
  const list = items ?? []
  const i = list.findIndex((it) => it.id === input.itemId)
  const j = input.direction === 'up' ? i - 1 : i + 1
  if (i < 0) return { error: 'No se encontró en la lista.' }
  if (j < 0 || j >= list.length) return {}

  // Se renumera todo en orden (1..n) con el par intercambiado: no hay posiciones repetidas
  const ordered = [...list]
  ;[ordered[i], ordered[j]] = [ordered[j], ordered[i]]
  const results = await Promise.all(
    ordered.map((it, n) => (it.position === n + 1 ? null : supabase.from('playlist_items').update({ position: n + 1 }).eq('id', it.id)))
  )
  if (results.some((r) => r?.error)) return { error: 'No se pudo mover.' }
  refresh(input.playlistId)
  return {}
}
