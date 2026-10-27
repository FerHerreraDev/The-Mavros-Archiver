package com.mavros.archiver.core.data.integration

import com.mavros.archiver.core.data.MavrosConfig
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.auth.MemorySessionManager
import io.github.jan.supabase.auth.admin.AdminUserUpdateBuilder
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import io.github.jan.supabase.auth.user.UserSession
import java.net.URI
import kotlin.time.Clock
import kotlin.time.Duration.Companion.minutes
import java.util.UUID

/**
 * Supabase LOCAL para las pruebas (lo levanta `pnpm db:start` en la raíz del repo).
 * Aborta si la URL no es local: estas pruebas nunca tocan producción.
 */
object LocalSupabase {
    private val status: JsonObject by lazy {
        val raw = System.getProperty("mavros.supabaseStatus").orEmpty()
        check(raw.contains("{")) { "Supabase local no está corriendo. Ejecuta: pnpm db:start" }
        Json.parseToJsonElement(raw.substring(raw.indexOf('{'))).jsonObject
    }

    val url: String by lazy {
        val u = status["API_URL"]!!.jsonPrimitive.content
        val host = URI(u).host
        check(host == "127.0.0.1" || host == "localhost") { "Las pruebas solo corren contra Supabase local: $u" }
        u
    }
    val anonKey get() = status["ANON_KEY"]!!.jsonPrimitive.content
    private val serviceKey get() = status["SERVICE_ROLE_KEY"]!!.jsonPrimitive.content

    val config get() = MavrosConfig(url, anonKey, "http://localhost:3100")

    /** Cliente service role, solo para preparar y limpiar datos */
    val admin: SupabaseClient by lazy {
        createSupabaseClient(url, serviceKey) {
            install(Auth) { sessionManager = MemorySessionManager(); autoLoadFromStorage = false; alwaysAutoRefresh = false }
            install(Postgrest)
        }
    }

    data class TestUser(val id: String, val email: String, val password: String)

    fun uniqueEmail(prefix: String) = "$prefix-${System.currentTimeMillis()}-${UUID.randomUUID().toString().take(6)}@example.com"

    suspend fun createUser(prefix: String = "and", role: String = "user"): TestUser {
        val email = uniqueEmail(prefix)
        val password = "pw-${UUID.randomUUID()}"
        val user = admin.auth.admin.createUserWithEmail {
            this.email = email
            this.password = password
            autoConfirm = true
            userMetadata = buildJsonObject { put("password_set", true) }
        }
        if (role == "admin") {
            admin.postgrest.from("profiles").update({ set("role", "admin") }) { filter { eq("id", user.id) } }
        }
        return TestUser(user.id, email, password)
    }

    /** Invitado que nunca eligió contraseña */
    suspend fun inviteUser(prefix: String = "and-invited"): TestUser {
        val email = uniqueEmail(prefix)
        admin.auth.admin.inviteUserByEmail(email)
        val id = admin.auth.admin.retrieveUsers().first { it.email == email }.id
        return TestUser(id, email, "nunca-eligio-contrasena")
    }

    suspend fun ban(userId: String) {
        admin.auth.admin.updateUserById(userId) { banDuration = "24h" }
    }

    suspend fun revokeSessions(userId: String) {
        admin.postgrest.rpc("revoke_user_sessions", buildJsonObject { put("target_user_id", userId) })
    }

    suspend fun deleteUsers(vararg ids: String) {
        ids.forEach { runCatching { admin.auth.admin.deleteUser(it) } }
    }

    suspend fun insertMovie(fields: Map<String, Any?>): String {
        val tag = UUID.randomUUID().toString().take(8)
        val slug = (fields["slug"] as? String) ?: "and-$tag"
        val body = buildJsonObject {
            put("slug", slug)
            put("title", (fields["title"] as? String) ?: "Android $tag")
            put("duration_seconds", (fields["duration_seconds"] as? Int) ?: 1000)
            put("hls_path", "movies/$slug/master.m3u8")
            put("status", (fields["status"] as? String) ?: "published")
            (fields["genres"] as? List<*>)?.let { genres ->
                put("genres", kotlinx.serialization.json.JsonArray(genres.map { kotlinx.serialization.json.JsonPrimitive(it as String) }))
            }
            // Episodio (SER-03)
            (fields["series_id"] as? String)?.let { put("series_id", it) }
            (fields["season_number"] as? Int)?.let { put("season_number", it) }
            (fields["episode_number"] as? Int)?.let { put("episode_number", it) }
        }
        val row = admin.postgrest.from("movies").insert(body) { select() }.decodeSingle<JsonObject>()
        val id = row["id"]!!.jsonPrimitive.content
        (fields["published_at"] as? String)?.let { at ->
            admin.postgrest.from("movies").update({ set("published_at", at) }) { filter { eq("id", id) } }
        }
        return id
    }

    suspend fun insertSeries(fields: Map<String, Any?> = emptyMap()): String {
        val tag = UUID.randomUUID().toString().take(8)
        val body = buildJsonObject {
            put("slug", "and-serie-$tag")
            put("title", (fields["title"] as? String) ?: "Serie $tag")
            put("status", (fields["status"] as? String) ?: "published")
            (fields["genres"] as? List<*>)?.let { genres ->
                put("genres", kotlinx.serialization.json.JsonArray(genres.map { kotlinx.serialization.json.JsonPrimitive(it as String) }))
            }
        }
        return admin.postgrest.from("series").insert(body) { select() }.decodeSingle<JsonObject>()["id"]!!.jsonPrimitive.content
    }

    /** Borra las series y, en cascada, sus episodios */
    suspend fun deleteSeries(ids: Collection<String>) {
        if (ids.isNotEmpty()) admin.postgrest.from("series").delete { filter { isIn("id", ids.toList()) } }
    }

    suspend fun deleteMovies(ids: Collection<String>) {
        if (ids.isNotEmpty()) admin.postgrest.from("movies").delete { filter { isIn("id", ids.toList()) } }
    }

    suspend fun setProgress(userId: String, movieId: String, seconds: Double) {
        admin.postgrest.from("watch_progress").upsert(buildJsonObject {
            put("user_id", userId); put("movie_id", movieId); put("position_seconds", seconds)
        })
    }

    /** Inicia sesión "a mano" (sin repositorio), para preparar escenarios */
    suspend fun signIn(client: SupabaseClient, user: TestUser) {
        client.auth.signInWith(Email) { email = user.email; password = user.password }
    }

    @Suppress("unused")
    private fun AdminUserUpdateBuilder.noop() = Unit

    /**
     * Token de acceso que el servidor rechaza (401) con el refresh token todavía válido: lo que tiene
     * el teléfono una hora después. El servidor local firma con ES256, así que no se puede fabricar uno
     * caducado con firma válida; para el cliente es lo mismo (firma alterada + expiresAt en el pasado).
     */
    fun UserSession.withRejectedAccessToken(): UserSession {
        val (header, payload, signature) = accessToken.split(".")
        return copy(accessToken = "$header.$payload.${signature.reversed()}", expiresAt = Clock.System.now() - 1.minutes)
    }
}
