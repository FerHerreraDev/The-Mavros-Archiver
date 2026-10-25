'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'
import { ratelimit } from '@/lib/rate-limit'
import { headers } from 'next/headers'
import { getSiteUrl } from '@/lib/site-url'

const TIMEOUT_MS = 10000 // 10 segundos

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

export async function inviteUserAction(formData: FormData) {
  // 1. RATE LIMITING - Proteger el endpoint de invitaciones
  const headersList = await headers()
  const ip = headersList.get('x-forwarded-for') ?? headersList.get('x-real-ip') ?? 'unknown'
  const { success } = await ratelimit.limit(`invite:${ip}`)
  
  if (!success) {
    return { error: 'Demasiados intentos. Por favor, espera un minuto.' }
  }

  try {
    // 2. PARSEO SEGURO: Convertimos explícitamente a String para evitar warnings de FormDataEntryValue
    const rawEmail = String(formData.get('email') || '')
    const { email } = InviteSchema.parse({ email: rawEmail })

    // 3. AUTENTICACIÓN: ¿Quién hace la petición?
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return { error: 'No autorizado. Debes iniciar sesión.' }
    }

    // 4. AUTORIZACIÓN: ¿Es un administrador?
    // Usamos Promise.resolve() para convertir el PostgrestBuilder en una Promesa nativa
    const { data: profile, error: profileError } = await withTimeout(
      Promise.resolve(
        supabase.from('profiles').select('role').eq('id', user.id).single()
      ),
      TIMEOUT_MS
    )

    if (profileError || profile?.role !== 'admin') {
      return { error: 'Acceso denegado. Se requieren privilegios de administrador.' }
    }

    // 5. EJECUCIÓN: Despertamos el God Mode (Admin Client)
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
