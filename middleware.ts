import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Middleware para proteger rutas privadas
 * Verifica autenticación y redirige si es necesario
 */
export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Verificar sesión
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Redirect que conserva las cookies de sesión que Supabase pudo refrescar arriba
  const redirectTo = (path: string, params?: Record<string, string>) => {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = path
    redirectUrl.search = ''
    Object.entries(params ?? {}).forEach(([key, value]) => redirectUrl.searchParams.set(key, value))
    const response = NextResponse.redirect(redirectUrl)
    supabaseResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie))
    return response
  }

  // Rutas protegidas que requieren autenticación
  const isProtectedRoute = pathname.startsWith('/dashboard')
  const isSetPasswordRoute = pathname.startsWith('/set-password')

  // Rutas de autenticación (no hay registro público: acceso solo por invitación)
  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/forgot-password')

  // Invitado que abrió el link pero aún no eligió contraseña.
  // password_set lo pone setPasswordAction (no es control de seguridad, solo de flujo)
  const mustSetPassword = !!user?.invited_at && !user.user_metadata?.password_set

  // Si intenta acceder a ruta protegida sin estar autenticado
  if ((isProtectedRoute || isSetPasswordRoute) && !user) {
    return redirectTo('/login', isProtectedRoute ? { redirectTo: pathname } : undefined)
  }

  // Invitado sin contraseña: primero /set-password
  if ((isProtectedRoute || isAuthRoute) && mustSetPassword) {
    return redirectTo('/set-password')
  }

  // Si está autenticado e intenta acceder a login, redirigir a dashboard
  if (isAuthRoute && user) {
    return redirectTo('/dashboard')
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
