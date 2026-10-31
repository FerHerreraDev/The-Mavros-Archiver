// Pedidos de películas (REQ-01..REQ-05): reglas compartidas por acciones y pantallas

export type RequestStatus = 'pending' | 'added' | 'rejected'
export type MovieRequest = {
  id: string
  user_id: string
  title: string
  note: string | null
  status: RequestStatus
  created_at: string
  resolved_at: string | null
}

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  pending: 'Pendiente',
  added: 'Ya está',
  rejected: 'No se pudo',
}

export const MAX_PENDING_REQUESTS = 20
export const DUPLICATE_REQUEST = 'Ya lo pediste y sigue pendiente.'
export const TOO_MANY_REQUESTS = `Tienes ${MAX_PENDING_REQUESTS} pedidos pendientes: espera a que se resuelvan.`

/** Mensaje para el usuario según el error de la base (REQ-02) */
export function requestErrorMessage(error: { code?: string; message?: string }): string {
  if (error.code === '23505') return DUPLICATE_REQUEST
  if (error.message?.includes('too_many_requests')) return TOO_MANY_REQUESTS
  return 'No se pudo enviar el pedido.'
}

/** Admin: primero los pendientes, más antiguo primero; luego los resueltos, más reciente primero (REQ-05) */
export function sortForAdmin<T extends Pick<MovieRequest, 'status' | 'created_at' | 'resolved_at'>>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => {
    const pa = a.status === 'pending' ? 0 : 1
    const pb = b.status === 'pending' ? 0 : 1
    if (pa !== pb) return pa - pb
    if (pa === 0) return Date.parse(a.created_at) - Date.parse(b.created_at)
    return Date.parse(b.resolved_at ?? b.created_at) - Date.parse(a.resolved_at ?? a.created_at)
  })
}
