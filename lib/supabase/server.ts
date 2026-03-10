/**
 * CLIENTE DE SUPABASE PARA EL SERVIDOR (Server Client)
 * 
 * ¿Cuándo usar este cliente?
 * - En Server Components (por defecto en App Router)
 * - En Server Actions (funciones con "use server")
 * - En API Routes (app/api/...)
 * - Para operaciones que requieren datos sensibles
 * 
 * ¿Por qué es MÁS SEGURO que el cliente del navegador?
 * - Maneja cookies HTTP-only (el navegador NO puede leerlas con JavaScript)
 * - Los tokens de sesión están protegidos contra XSS
 * - Puede usar SERVICE_ROLE_KEY si es necesario (bypass RLS)
 * - Se ejecuta en el servidor, nunca expone código al cliente
 * 
 * Diferencia clave:
 * - Browser Client → tokens en localStorage (vulnerable a XSS)
 * - Server Client → tokens en cookies HTTP-only (seguro)
 * 
 * Ejemplo de uso en Server Component:
 * ```tsx
 * import { createClient } from '@/lib/supabase/server'
 * 
 * export default async function DashboardPage() {
 *   const supabase = await createClient()
 *   const { data: user } = await supabase.auth.getUser()
 *   
 *   return <div>Hola {user?.email}</div>
 * }
 * ```
 * 
 * Ejemplo de uso en Server Action:
 * ```tsx
 * "use server"
 * import { createClient } from '@/lib/supabase/server'
 * 
 * export async function loginAction(formData: FormData) {
 *   const supabase = await createClient()
 *   const { error } = await supabase.auth.signInWithPassword({
 *     email: formData.get('email'),
 *     password: formData.get('password')
 *   })
 * }
 * ```
 */

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        // Obtener todas las cookies del request
        getAll() {
          return cookieStore.getAll()
        },
        // Establecer cookies en el response
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Esto puede fallar en Server Components
            // Las cookies solo se pueden establecer en Server Actions o Route Handlers
          }
        },
      },
    }
  )
}
