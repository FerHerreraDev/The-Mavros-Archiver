import 'server-only'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { isBanned } from '@/lib/user-status'

export type DeviceSession = {
  access_token: string
  refresh_token: string
  expires_at: number
  token_type: 'bearer'
  user: { id: string; email: string | undefined }
}

/**
 * Crea una sesión de Supabase para el usuario que aprobó (DEV-04).
 * Supabase no tiene "emitir sesión para X", así que se hace como un login por enlace mágico
 * pero sin correo: el admin genera el token y el servidor lo canjea al momento.
 * Usuario inexistente o desactivado -> null (DEV-08).
 */
export async function mintSessionFor(userId: string): Promise<DeviceSession | null> {
  const admin = createAdminClient()
  const { data: found, error: findError } = await admin.auth.admin.getUserById(userId)
  if (findError || !found.user?.email || isBanned(found.user)) return null

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email: found.user.email })
  if (linkError || !link.properties?.hashed_token) {
    console.error('[DEVICE] generateLink falló:', linkError?.message)
    return null
  }

  const verifier = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await verifier.auth.verifyOtp({ type: 'magiclink', token_hash: link.properties.hashed_token })
  if (error || !data.session || data.session.user.id !== userId) {
    console.error('[DEVICE] verifyOtp falló:', error?.message)
    return null
  }

  const { session } = data
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at ?? Math.floor(Date.now() / 1000) + session.expires_in,
    token_type: 'bearer',
    user: { id: session.user.id, email: session.user.email },
  }
}
