/**
 * CLIENTE DE SUPABASE PARA MIDDLEWARE
 * 
 * ¿Qué es el Middleware?
 * - Se ejecuta ANTES de que se cargue cualquier página
 * - Intercepta TODAS las requests
 * - Perfecto para verificar autenticación y proteger rutas
 * 
 * ¿Cuándo se ejecuta?
 * - En cada navegación del usuario
 * - Antes de Server Components
 * - Antes de API Routes
 * 
 * ¿Para qué sirve?
 * - Verificar si el usuario está autenticado
 * - Redirigir usuarios no autenticados a /login
 * - Renovar tokens de sesión automáticamente
 * - Proteger rutas privadas (/dashboard, /profile, etc.)
 * - Redirigir usuarios autenticados fuera de /login
 * 
 * Flujo de seguridad:
 * 1. Usuario intenta acceder a /dashboard
 * 2. Middleware intercepta el request
 * 3. Verifica la cookie de sesión
 * 4. Si NO hay sesión → redirige a /login
 * 5. Si SÍ hay sesión → permite acceso
 * 6. Renueva el token si está por expirar
 * 
 * Ejemplo de uso (en middleware.ts raíz):
 * ```tsx
 * import { updateSession } from '@/lib/supabase/middleware'
 * 
 * export async function middleware(request: NextRequest) {
 *   return await updateSession(request)
 * }
 * 
 * export const config = {
 *   matcher: [
 *     '/dashboard/:path*',
 *     '/profile/:path*',
 *   ]
 * }
 * ```
 */

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  // Crear un response que podemos modificar
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        // Obtener todas las cookies del request
        getAll() {
          return request.cookies.getAll()
        },
        // Establecer cookies en el response
        setAll(cookiesToSet) {
          // Establecer cookies en el request (para que las vea Supabase)
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          
          // Crear nuevo response con las cookies actualizadas
          supabaseResponse = NextResponse.next({
            request,
          })
          
          // Establecer cookies en el response (para que las vea el navegador)
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // IMPORTANTE: Esto renueva la sesión si está por expirar
  // No elimines esta línea, es crucial para mantener al usuario logueado
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Aquí puedes agregar lógica de redirección
  // Ejemplo: redirigir a /login si no está autenticado
  // if (!user && request.nextUrl.pathname.startsWith('/dashboard')) {
  //   const url = request.nextUrl.clone()
  //   url.pathname = '/login'
  //   return NextResponse.redirect(url)
  // }

  return supabaseResponse
}
