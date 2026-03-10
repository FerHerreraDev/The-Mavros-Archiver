'use server'

import { createClient } from '@/lib/supabase/server'
import { loginSchema, registerSchema } from '@/lib/validations/auth.schema'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { ratelimit } from '@/lib/rate-limit'
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
  const ip = headersList.get('x-forwarded-for') ?? headersList.get('x-real-ip') ?? 'unknown'
  const { success, remaining } = await ratelimit.limit(`login:${ip}`)
  
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
    const { error, data } = await withTimeout(
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

    // Success - revalidate cache and redirect
    revalidatePath('/', 'layout')
    
    // Note: redirect() throws a Next.js error to stop execution
    // This is intentional behavior, not a bug
    redirect('/dashboard')
    
  } catch (err) {
    console.error('[AUTH] Unexpected error during login:', err)
    
    if (err instanceof Error && err.message === 'Request timeout') {
      return { error: 'Request timed out. Please try again.' }
    }
    
    return { error: 'An unexpected error occurred. Please try again.' }
  }
}

/**
 * Server action for user registration
 * Creates new user account with email confirmation
 */
export async function registerAction(formData: FormData) {
  const email = formData.get('email')
  const password = formData.get('password')
  const confirmPassword = formData.get('confirmPassword')

  // Validate input with Zod schema
  const result = registerSchema.safeParse({ email, password, confirmPassword })

  if (!result.success) {
    const flattened = z.flattenError(result.error)
    return {
      error: 'Invalid input',
      fieldErrors: flattened.fieldErrors,
    }
  }

  // Create server-side Supabase client
  const supabase = await createClient()

  // Create new user account
  const { error } = await supabase.auth.signUp({
    email: result.data.email,
    password: result.data.password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    },
  })

  if (error) {
    // Check for specific errors
    if (error.message.includes('already registered')) {
      return { error: 'Email already registered' }
    }
    return { error: 'Registration failed. Please try again.' }
  }

  // Redirect to confirmation page
  redirect('/auth/confirm-email')
}

/**
 * Server action for user logout
 * Clears session and redirects to home
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
  redirect('/')
}
