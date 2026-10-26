package com.mavros.archiver.mobile.session

import android.content.Context
import io.github.jan.supabase.auth.SessionManager
import io.github.jan.supabase.auth.exception.NoSessionFoundException
import io.github.jan.supabase.auth.user.UserSession
import kotlinx.serialization.json.Json

/**
 * Guarda la sesión de Supabase en SharedPreferences PRIVADAS de la app (MOB-04).
 * Solo esta app las puede leer, y quedan excluidas de backups y de transferencias
 * entre dispositivos (res/xml/data_extraction_rules.xml).
 */
class PrefsSessionManager(context: Context) : SessionManager {
    private val prefs = context.getSharedPreferences("mavros_session", Context.MODE_PRIVATE)
    private val json = Json { ignoreUnknownKeys = true }

    override suspend fun saveSession(session: UserSession) {
        prefs.edit().putString(KEY, json.encodeToString(UserSession.serializer(), session)).apply()
    }

    /** supabase-kt espera que "no hay sesión" se indique lanzando NoSessionFoundException */
    override suspend fun loadSession(): UserSession {
        val raw = prefs.getString(KEY, null) ?: throw NoSessionFoundException()
        return runCatching { json.decodeFromString(UserSession.serializer(), raw) }
            .getOrElse { throw NoSessionFoundException() }
    }

    override suspend fun deleteSession() {
        prefs.edit().remove(KEY).apply()
    }

    private companion object {
        const val KEY = "session"
    }
}
