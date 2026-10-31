import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { sortForAdmin, type MovieRequest } from '@/lib/requests'

const FIELDS = 'id, user_id, title, note, status, created_at, resolved_at'

/** Mis pedidos, el más nuevo primero (REQ-04). RLS: solo los propios (también para un admin aquí) */
export async function listMyRequests(): Promise<MovieRequest[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase.from('movie_requests').select(FIELDS).eq('user_id', user.id).order('created_at', { ascending: false })
  if (error) throw new Error(`[REQUESTS] ${error.message}`)
  return (data ?? []) as MovieRequest[]
}

export type AdminRequest = MovieRequest & { email: string | null }

/** Todos los pedidos con el correo de quién pidió (REQ-05). Solo un admin los ve todos (RLS). */
export async function listAllRequests(): Promise<AdminRequest[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('movie_requests').select(FIELDS)
  if (error) throw new Error(`[REQUESTS] ${error.message}`)
  const rows = (data ?? []) as MovieRequest[]
  const ids = [...new Set(rows.map((r) => r.user_id))]
  const { data: profiles } = ids.length ? await supabase.from('profiles').select('id, email').in('id', ids) : { data: [] }
  const emails = new Map((profiles ?? []).map((p) => [p.id as string, p.email as string | null]))
  return sortForAdmin(rows).map((r) => ({ ...r, email: emails.get(r.user_id) ?? null }))
}

/** Cuántos pendientes hay (pestaña del panel) */
export async function pendingRequestCount(): Promise<number> {
  const supabase = await createClient()
  const { count } = await supabase.from('movie_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending')
  return count ?? 0
}
