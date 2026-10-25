'use server'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/auth/guards'
import { userStatus } from '@/lib/user-status'
import { z } from 'zod'
import { ratelimit } from '@/lib/rate-limit'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getSiteUrl } from '@/lib/site-url'

const TIMEOUT_MS = 10000 // 10 segundos
const ADMIN_PATH = '/dashboard/admin'
// Supabase no tiene "ban permanente": 100 años
const BAN_FOREVER = '876000h'

const DENIED = 'Acceso denegado. Se requieren privilegios de administrador.'

export type AdminActionResult = { success?: string; error?: string }

// Función de utilidad para proteger las promesas
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Request timeout')), ms)
  )
  return Promise.race([promise, timeout])
}

// El estándar actual de Zod: Reemplaza .nonempty() por .min(1) y agrega .trim()
const InviteSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'El correo no puede estar vacío')
    .email('Formato de correo inválido'),
})

const UserIdSchema = z.uuid()

export async function inviteUserAction(formData: FormData): Promise<AdminActionResult> {
  // 1. RATE LIMITING - Proteger el endpoint de invitaciones
  const headersList = await headers()
  const ip = headersList.get('x-forwarded-for') ?? headersList.get('x-real-ip') ?? 'unknown'
  const { success } = await ratelimit.limit(`invite:${ip}`)

  if (!success) {
    return { error: 'Demasiados intentos. Por favor, espera un minuto.' }
  }

  try {
    // 2. AUTORIZACIÓN: ¿Hay sesión y es admin?
    const session = await withTimeout(requireAdmin(), TIMEOUT_MS)
    if (!session) {
      return { error: DENIED }
    }

    // 3. PARSEO SEGURO: Convertimos explícitamente a String para evitar warnings de FormDataEntryValue
    const rawEmail = String(formData.get('email') || '')
    const { email } = InviteSchema.parse({ email: rawEmail })

    // 4. EJECUCIÓN: Despertamos el God Mode (Admin Client)
    const adminClient = createAdminClient()
    const siteUrl = await getSiteUrl()

    // Disparamos la invitación con protección de Timeout
    // El link del correo cae en /auth/confirm, que crea la sesión y manda a /set-password
    const { error: inviteError } = await withTimeout(
      adminClient.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${siteUrl}/auth/confirm?next=/set-password`,
      }),
      TIMEOUT_MS
    )

    if (inviteError) {
      console.error('[ADMIN] Error invitando usuario:', inviteError.message)
      if (inviteError.code === 'email_exists') {
        return { error: 'Este correo ya pertenece a un usuario registrado.' }
      }
      return { error: 'Hubo un problema al enviar la invitación.' }
    }

    revalidatePath(ADMIN_PATH)
    return { success: `¡Invitación enviada con éxito a ${email}!` }

  } catch (error) {
    // Manejo de errores de Zod
    if (error instanceof z.ZodError) {
      return { error: error.issues[0].message }
    }

    if (error instanceof Error && error.message === 'Request timeout') {
      return { error: 'La petición tardó demasiado. Intenta de nuevo.' }
    }

    console.error('[ADMIN] Unexpected error:', error)
    return { error: 'Ocurrió un error inesperado en el servidor.' }
  }
}

/**
 * Cambia el rol de otro usuario (user <-> admin)
 * Se escribe con el admin client porque RLS bloquea toda escritura en profiles desde el cliente
 */
export async function updateUserRoleAction(input: { userId: string; role: string }): Promise<AdminActionResult> {
  const session = await requireAdmin()
  if (!session) return { error: DENIED }

  const parsed = z.object({ userId: UserIdSchema, role: z.enum(['admin', 'user']) }).safeParse(input)
  if (!parsed.success) return { error: 'Datos inválidos.' }

  const { userId, role } = parsed.data
  if (userId === session.user.id) {
    return { error: 'No puedes cambiar tu propio rol.' }
  }

  const { data, error } = await createAdminClient()
    .from('profiles')
    .update({ role })
    .eq('id', userId)
    .select('email')

  if (error) {
    console.error('[ADMIN] Error cambiando rol:', error.message)
    return { error: 'No se pudo cambiar el rol.' }
  }
  if (!data?.length) return { error: 'Usuario no encontrado.' }

  revalidatePath(ADMIN_PATH)
  return { success: `${data[0].email} ahora es ${role}.` }
}

/**
 * Reenvía la invitación a un usuario pendiente
 * - Si nunca abrió el link: nueva invitación
 * - Si abrió el link pero no eligió contraseña (email ya confirmado): link de recuperación,
 *   que también lleva a /set-password
 */
export async function resendInviteAction(input: { userId: string }): Promise<AdminActionResult> {
  const session = await requireAdmin()
  if (!session) return { error: DENIED }

  const parsed = z.object({ userId: UserIdSchema }).safeParse(input)
  if (!parsed.success) return { error: 'Datos inválidos.' }

  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.getUserById(parsed.data.userId)
  if (error || !data.user?.email) return { error: 'Usuario no encontrado.' }

  const user = data.user
  if (userStatus(user) !== 'pending') {
    return { error: 'Solo se puede reenviar la invitación a usuarios pendientes.' }
  }

  const redirectTo = `${await getSiteUrl()}/auth/confirm?next=/set-password`

  const { error: sendError } = user.email_confirmed_at
    ? await createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
      }).auth.resetPasswordForEmail(user.email!, { redirectTo })
    : await admin.auth.admin.inviteUserByEmail(user.email!, { redirectTo })

  if (sendError) {
    console.error('[ADMIN] Error reenviando invitación:', sendError.message)
    return { error: 'No se pudo reenviar la invitación.' }
  }

  return { success: `Invitación reenviada a ${user.email}.` }
}

/**
 * Desactiva (ban) o reactiva a otro usuario
 */
export async function setUserActiveAction(input: { userId: string; active: boolean }): Promise<AdminActionResult> {
  const session = await requireAdmin()
  if (!session) return { error: DENIED }

  const parsed = z.object({ userId: UserIdSchema, active: z.boolean() }).safeParse(input)
  if (!parsed.success) return { error: 'Datos inválidos.' }

  const { userId, active } = parsed.data
  if (userId === session.user.id) {
    return { error: 'No puedes desactivar tu propia cuenta.' }
  }

  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: active ? 'none' : BAN_FOREVER,
  })

  if (error) {
    if (error.code === 'user_not_found') return { error: 'Usuario no encontrado.' }
    console.error('[ADMIN] Error cambiando estado:', error.message)
    return { error: 'No se pudo actualizar el usuario.' }
  }

  // El ban solo suspende: sin esto, sus sesiones abiertas reviven al reactivarlo
  if (!active) {
    const { error: revokeError } = await admin.rpc('revoke_user_sessions', { target_user_id: userId })
    if (revokeError) {
      console.error('[ADMIN] Error cerrando sesiones:', revokeError.message)
      return { error: 'Usuario desactivado, pero no se pudieron cerrar sus sesiones. Intenta de nuevo.' }
    }
  }

  revalidatePath(ADMIN_PATH)
  return { success: `${data.user.email} ${active ? 'reactivado' : 'desactivado'}.` }
}
