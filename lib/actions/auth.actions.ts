'use server'

import { createClient } from '@/lib/supabase/server'
import { loginSchema, forgotPasswordSchema, resetPasswordSchema } from '@/lib/validations/auth.schema'
import { getSiteUrl } from '@/lib/site-url'
import { safeInternalPath } from '@/lib/safe-redirect'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { ratelimit } from '@/lib/rate-limit'
import { clientIp } from '@/lib/client-ip'
import { headers } from 'next/headers'

// Timeout para requests de Supabase
const TIMEOUT_MS = 10000 // 10 segundos

/**
 * Wrapper para agregar timeout a promesas
 */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Request timeout')), ms)
  )
  return Promise.race([promise, timeout])
}

/**
 * Server action for user login
 * Validates credentials and creates secure session with HTTP-only cookies
 * Includes rate limiting, timeout protection, and detailed error handling
 */
export async function loginAction(formData: FormData) {
  // RATE LIMITING - Prevenir brute force attacks
  const headersList = await headers()
  const ip = clientIp(headersList)
  const { success } = await ratelimit.limit(`login:${ip}`)
  
  if (!success) {
    console.warn(`[AUTH] Rate limit exceeded for IP: ${ip}`)
    return { 
      error: 'Too many login attempts. Please try again in a minute.',
      remaining: 0
    }
  }

  const email = formData.get('email')
  const password = formData.get('password')

  // Validate input with Zod schema
  const result = loginSchema.safeParse({ email, password })

  if (!result.success) {
    const flattened = z.flattenError(result.error)
    return {
      error: 'Invalid credentials',
      fieldErrors: flattened.fieldErrors,
    }
  }

  // Create server-side Supabase client (HTTP-only cookies)
  const supabase = await createClient()

  try {
    // Authenticate user with timeout protection
    const { error } = await withTimeout(
      supabase.auth.signInWithPassword({
        email: result.data.email,
        password: result.data.password,
      }),
      TIMEOUT_MS
    )

    if (error) {
      // Log error para debugging (sin exponer al usuario)
      console.error('[AUTH] Login failed:', {
        email: result.data.email,
        error: error.message,
        timestamp: new Date().toISOString(),
      })

      // Detectar casos específicos
      if (error.message.includes('Email not confirmed')) {
        return { error: 'Please confirm your email before logging in.' }
      }

      if (error.message.includes('Invalid login credentials')) {
        return { error: 'Invalid email or password.' }
      }

      // Mensaje genérico para prevenir user enumeration
      return { error: 'Authentication failed. Please try again.' }
    }
    
  } catch (err) {
    console.error('[AUTH] Unexpected error during login:', err)
    
    if (err instanceof Error && err.message === 'Request timeout') {
      return { error: 'Request timed out. Please try again.' }
    }
    
    return { error: 'An unexpected error occurred. Please try again.' }
  }

  revalidatePath('/', 'layout')
  // Volver a donde iba antes de que el middleware lo mandara a /login
  redirect(safeInternalPath(formData.get('redirectTo')))
}

/**
 * Server action para que un usuario invitado (o en recuperación) elija su contraseña
 * Requiere sesión activa: la crea /auth/confirm al abrir el link del correo
 */
export async function setPasswordAction(formData: FormData) {
  const result = resetPasswordSchema.safeParse({
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  })

  if (!result.success) {
    const flattened = z.flattenError(result.error)
    return {
      error: 'Invalid input',
      fieldErrors: flattened.fieldErrors,
    }
  }

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return { error: 'Your session expired. Open the link from your email again.' }
  }

  const { success } = await ratelimit.limit(`set-password:${user.id}`)
  if (!success) {
    return { error: 'Too many attempts. Please try again in a minute.' }
  }

  try {
    const { error } = await withTimeout(
      supabase.auth.updateUser({
        password: result.data.password,
        // El middleware usa esta marca para no dejar pasar al dashboard
        // a un invitado que todavía no eligió contraseña
        data: { password_set: true },
      }),
      TIMEOUT_MS
    )

    if (error) {
      console.error('[AUTH] Set password failed:', error.message)

      if (error.code === 'same_password') {
        return { error: 'The new password must be different from the current one.' }
      }
      if (error.code === 'weak_password') {
        return { error: 'That password is too weak. Try a longer one.' }
      }
      return { error: 'Could not update your password. Please try again.' }
    }
  } catch (err) {
    console.error('[AUTH] Unexpected error during set password:', err)

    if (err instanceof Error && err.message === 'Request timeout') {
      return { error: 'Request timed out. Please try again.' }
    }

    return { error: 'An unexpected error occurred. Please try again.' }
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

/**
 * Server action para pedir un link de recuperación de contraseña
 * Siempre responde lo mismo para no revelar qué correos existen
 */
export async function forgotPasswordAction(formData: FormData) {
  const headersList = await headers()
  const ip = clientIp(headersList)
  const { success } = await ratelimit.limit(`forgot:${ip}`)

  if (!success) {
    return { error: 'Too many attempts. Please try again in a minute.' }
  }

  const result = forgotPasswordSchema.safeParse({ email: formData.get('email') })

  if (!result.success) {
    const flattened = z.flattenError(result.error)
    return {
      error: 'Invalid input',
      fieldErrors: flattened.fieldErrors,
    }
  }

  const supabase = await createClient()
  const siteUrl = await getSiteUrl()

  try {
    const { error } = await withTimeout(
      supabase.auth.resetPasswordForEmail(result.data.email, {
        redirectTo: `${siteUrl}/auth/confirm?next=/set-password`,
      }),
      TIMEOUT_MS
    )

    if (error) {
      // Solo log: al usuario siempre le decimos lo mismo
      console.error('[AUTH] Reset password email failed:', error.message)
    }
  } catch (err) {
    console.error('[AUTH] Unexpected error during forgot password:', err)
  }

  return { success: 'If that email has access, a reset link is on its way.' }
}

/**
 * Server action for user logout
 * Clears session and redirects to login
 */
export async function logoutAction() {
  const supabase = await createClient()

  const { error } = await supabase.auth.signOut()

  if (error) {
    console.error('[AUTH] Logout failed:', error.message)
    // En caso de error, aún así redirigir (limpiar sesión local)
  }

  revalidatePath('/', 'layout')
  
  // Note: redirect() throws a Next.js error to stop execution
  redirect('/login')
}
