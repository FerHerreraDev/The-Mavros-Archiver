/**
 * CLIENTE DE SUPABASE ADMIN (God Mode)
 * * ¿Cuándo usar este cliente?
 * - EXCLUSIVAMENTE dentro de Server Actions protegidas.
 * - Para invitar usuarios (auth.admin.inviteUserByEmail).
 * - Para modificar perfiles saltándose el RLS.
 * * ⚠️ ADVERTENCIA: Este cliente tiene la SERVICE_ROLE_KEY.
 * Ignora por completo todas las reglas de Row Level Security (RLS).
 * NUNCA debe ser expuesto al cliente.
 */

import { createClient } from '@supabase/supabase-js';
// Esta línea es un seguro de vida. Si por error importas esto en un componente de React normal, Next.js detendrá la app.
import 'server-only'; 

export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Faltan las variables de entorno de Supabase Admin (URL o SERVICE_ROLE_KEY).');
  }

  // Nota: Usamos @supabase/supabase-js normal, no el de SSR, 
  // porque el Admin no necesita leer cookies del navegador para hacer su trabajo.
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
