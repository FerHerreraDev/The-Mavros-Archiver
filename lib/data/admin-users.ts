import 'server-only'
import type { User } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth/guards'
import { userStatus, type Role, type UserStatus } from '@/lib/user-status'

export type AdminUserRow = {
  id: string
  email: string
  role: Role
  status: UserStatus
  createdAt: string
  lastSignInAt: string | null
  isSelf: boolean
}

/**
 * Todos los usuarios para la tabla del panel admin.
 * Devuelve null si quien pregunta no es admin.
 */
export async function listUsersForAdmin(): Promise<AdminUserRow[] | null> {
  const session = await requireAdmin()
  if (!session) return null

  const admin = createAdminClient()

  // auth.admin.listUsers pagina; recorremos todas las páginas
  const users: User[] = []
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`[ADMIN] listUsers failed: ${error.message}`)
    users.push(...data.users)
    if (data.users.length < 1000) break
  }

  const { data: profiles, error: profilesError } = await admin.from('profiles').select('id, role')
  if (profilesError) throw new Error(`[ADMIN] profiles failed: ${profilesError.message}`)
  const roles = new Map(profiles.map((p) => [p.id as string, p.role as Role]))

  return users
    .map((u) => ({
      id: u.id,
      email: u.email ?? '',
      role: roles.get(u.id) ?? 'user',
      status: userStatus(u),
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at ?? null,
      isSelf: u.id === session.user.id,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
