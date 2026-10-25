import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { isBanned, type Role } from '@/lib/user-status'

/**
 * Usuario con sesión + su rol, leído en el servidor.
 * Un usuario desactivado cuenta como sin sesión.
 */
export async function getSessionUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user || isBanned(user)) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const role: Role = profile?.role === 'admin' ? 'admin' : 'user'
  return { supabase, user, role }
}

/** Igual que getSessionUser, pero null si no es admin */
export async function requireAdmin() {
  const session = await getSessionUser()
  return session?.role === 'admin' ? session : null
}
