/**
 * CLIENTE DE SUPABASE PARA EL NAVEGADOR (Browser Client)
 * 
 * ¿Cuándo usar este cliente?
 * - En componentes con "use client"
 * - En hooks personalizados (useState, useEffect, etc.)
 * - En event handlers (onClick, onSubmit, onChange)
 * - Para interacciones en tiempo real (subscriptions)
 * 
 * ¿Por qué es seguro?
 * - Usa la ANON_KEY (pública, diseñada para estar en el frontend)
 * - Protegido por Row Level Security (RLS) en Supabase
 * - Los tokens se guardan en localStorage del navegador
 * 
 * Ejemplo de uso:
 * ```tsx
 * "use client"
 * import { createClient } from '@/lib/supabase/client'
 * 
 * export function LoginButton() {
 *   const supabase = createClient()
 *   
 *   const handleLogin = async () => {
 *     const { data } = await supabase.auth.signInWithOAuth({
 *       provider: 'google'
 *     })
 *   }
 * }
 * ```
 */

import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
