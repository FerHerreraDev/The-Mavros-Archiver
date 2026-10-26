package com.mavros.archiver.core.data

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.auth.MemoryCodeVerifierCache
import io.github.jan.supabase.auth.SessionManager
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.postgrest.Postgrest

/**
 * Lo único que la app sabe del backend (MOB-01): URL de Supabase, clave PÚBLICA y URL del sitio.
 * Nunca la service role key ni el secreto del token de video.
 */
data class MavrosConfig(
    val supabaseUrl: String,
    val supabaseAnonKey: String,
    val siteUrl: String,
)

fun createMavrosSupabase(config: MavrosConfig, sessionManager: SessionManager? = null): SupabaseClient =
    createSupabaseClient(config.supabaseUrl, config.supabaseAnonKey) {
        install(Auth) {
            // La app pone su propio almacenamiento (SharedPreferences privadas); las pruebas, uno en memoria
            if (sessionManager != null) this.sessionManager = sessionManager
            // Solo se usa en flujos PKCE (OAuth / enlace mágico), que la app no tiene. Explícito para no
            // depender de la inicialización automática de supabase-kt (truena si App Startup no corrió)
            codeVerifierCache = MemoryCodeVerifierCache()
        }
        install(Postgrest)
    }
