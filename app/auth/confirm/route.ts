import { type EmailOtpType } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { safeInternalPath } from '@/lib/safe-redirect'

/**
 * Destino de los links de correo de Supabase (invitación y recuperación).
 *
 * Soporta dos formatos:
 * - ?token_hash=...&type=invite|recovery  (templates de /supabase/templates)
 * - ?code=...                             (flujo PKCE)
 *
 * Canjea el token por una sesión (cookies HTTP-only) y manda al usuario
 * a /set-password para que elija su contraseña.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const code = searchParams.get('code')

  const next = safeInternalPath(searchParams.get('next'))

  const supabase = await createClient()
  let failed = true

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (error) console.error('[AUTH] verifyOtp failed:', error.message)
    failed = !!error
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) console.error('[AUTH] exchangeCodeForSession failed:', error.message)
    failed = !!error
  }

  if (failed) {
    redirect('/login?error=link_invalid')
  }

  // Invitados y recuperación siempre tienen que elegir contraseña
  if (type === 'invite' || type === 'recovery') {
    redirect('/set-password')
  }

  redirect(next)
}
