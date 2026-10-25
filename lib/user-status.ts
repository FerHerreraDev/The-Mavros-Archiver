export type UserStatus = 'active' | 'pending' | 'disabled'
export type Role = 'admin' | 'user'

// La API de Auth devuelve banned_until, pero el tipo User de supabase-js no lo declara
type StatusFields = {
  banned_until?: string | null
  invited_at?: string | null
  user_metadata?: Record<string, unknown> | null
}

export function isBanned(user: object, now = new Date()) {
  const { banned_until } = user as StatusFields
  return !!banned_until && new Date(banned_until) > now
}

/**
 * - disabled: un admin lo desactivó (ban activo)
 * - pending: invitado que todavía no eligió contraseña
 * - active: todo lo demás
 */
export function userStatus(user: object, now = new Date()): UserStatus {
  const { invited_at, user_metadata } = user as StatusFields
  if (isBanned(user, now)) return 'disabled'
  if (invited_at && !user_metadata?.password_set) return 'pending'
  return 'active'
}
