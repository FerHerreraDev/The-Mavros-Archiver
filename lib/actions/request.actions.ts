'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/guards'
import { requestErrorMessage } from '@/lib/requests'

// Con la sesión del usuario: RLS decide qué puede crear, ver, borrar y resolver (REQ-01)
export type RequestActionResult = { success?: string; error?: string }

const Id = z.uuid()
const Title = z.string().trim().min(1, 'Escribe qué quieres ver.').max(200, 'Título: máximo 200 caracteres.')
const Note = z.string().trim().max(500, 'Nota: máximo 500 caracteres.').optional()
const Status = z.enum(['pending', 'added', 'rejected'])

function refresh() {
  revalidatePath('/dashboard/requests')
  revalidatePath('/dashboard/admin', 'layout')
}

/** "Pedir «…»" y el formulario de Mis pedidos (REQ-03, REQ-04) */
export async function requestMovieAction(input: { title: string; note?: string }): Promise<RequestActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Tu sesión expiró.' }
  const title = Title.safeParse(input.title.replace(/\s+/g, ' '))
  if (!title.success) return { error: title.error.issues[0].message }
  const note = Note.safeParse(input.note)
  if (!note.success) return { error: note.error.issues[0].message }

  const { error } = await supabase.from('movie_requests').insert({ title: title.data, note: note.data || null })
  if (error) return { error: requestErrorMessage(error) }
  refresh()
  return { success: 'Listo, se lo pedimos al admin.' }
}

/** Borrar un pedido propio pendiente (REQ-04) */
export async function deleteRequestAction(id: string): Promise<RequestActionResult> {
  if (!Id.safeParse(id).success) return { error: 'Pedido no encontrado.' }
  const supabase = await createClient()
  const { data } = await supabase.from('movie_requests').delete().eq('id', id).select('id')
  if (!data?.length) return { error: 'Ese pedido ya no se puede borrar.' }
  refresh()
  return { success: 'Pedido borrado.' }
}

/** Panel: "Ya está" / "No se puede" (o regresarlo a pendiente) (REQ-05) */
export async function resolveRequestAction(input: { id: string; status: string }): Promise<RequestActionResult> {
  const session = await requireAdmin()
  if (!session) return { error: 'No autorizado.' }
  const status = Status.safeParse(input.status)
  if (!status.success || !Id.safeParse(input.id).success) return { error: 'Datos inválidos.' }

  const { data } = await session.supabase.from('movie_requests').update({ status: status.data }).eq('id', input.id).select('id')
  if (!data?.length) return { error: 'Pedido no encontrado.' }
  refresh()
  return { success: 'Pedido actualizado.' }
}
