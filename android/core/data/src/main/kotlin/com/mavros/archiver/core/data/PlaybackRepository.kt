package com.mavros.archiver.core.data

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.from
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.time.Instant
import kotlin.math.round

/** URL firmada del master.m3u8 en el Worker y cuándo caduca su token (PLY-08) */
data class PlaybackSource(val url: String, val expiresAtMs: Long)

interface PlaybackRepository {
    /** null = la película no existe o este usuario no la puede ver (PLY-07) */
    suspend fun source(movieId: String): DataResult<PlaybackSource?>
}

interface ProgressRepository {
    suspend fun save(movieId: String, positionSeconds: Double): DataResult<Unit>

    /** id de cada película cuyo progreso se acaba de guardar en el servidor (MOB-19) */
    val saved: SharedFlow<String>
}

/**
 * Pide la URL a `/api/playback/<id>` de la web con el access token de Supabase (MOB-13, PLY-06).
 * La web firma el token del Worker: el secreto nunca llega al teléfono.
 */
class HttpPlaybackRepository(
    private val config: MavrosConfig,
    private val client: SupabaseClient,
    private val auth: AuthRepository,
    private val http: HttpClient = HttpClient(OkHttp),
) : PlaybackRepository {
    private val json = Json { ignoreUnknownKeys = true }

    @Serializable
    private data class Response(val url: String, @SerialName("expires_at") val expiresAt: String)

    override suspend fun source(movieId: String): DataResult<PlaybackSource?> = try {
        var response = request(movieId)
        // 401 con una sesión que sigue siendo válida (token recién renovado): un reintento
        if (response.first == HttpStatusCode.Unauthorized && auth.validateSession()) response = request(movieId)
        when (response.first) {
            HttpStatusCode.OK -> {
                val body = json.decodeFromString<Response>(response.second)
                DataResult.Success(PlaybackSource(body.url, Instant.parse(body.expiresAt).toEpochMilli()))
            }
            HttpStatusCode.NotFound -> DataResult.Success(null)
            HttpStatusCode.Unauthorized -> {
                auth.onUnauthorized()
                DataResult.Failure(DataError.Unauthorized)
            }
            else -> DataResult.Failure(DataError.Server)
        }
    } catch (e: CancellationException) {
        throw e
    } catch (e: Throwable) {
        DataResult.Failure(e.toDataError())
    }

    private suspend fun request(movieId: String): Pair<HttpStatusCode, String> {
        val session = client.auth.currentSessionOrNull() ?: return HttpStatusCode.Unauthorized to ""
        // Token por caducar (dura 1 h): se renueva antes de llamar (MOB-04)
        if (session.expiresAt.toEpochMilliseconds() - System.currentTimeMillis() < 30_000) {
            runCatching { client.auth.refreshCurrentSession() }.onFailure { if (it is CancellationException) throw it }
        }
        val token = client.auth.currentAccessTokenOrNull() ?: return HttpStatusCode.Unauthorized to ""
        val res = http.get("${config.siteUrl.trimEnd('/')}/api/playback/$movieId") {
            header(HttpHeaders.Authorization, "Bearer $token")
        }
        return res.status to res.bodyAsText()
    }
}

/** Progreso escrito por el propio cliente bajo RLS (PRG-01, PRG-03): user_id lo pone la base (auth.uid()) */
class SupabaseProgressRepository(private val client: SupabaseClient) : ProgressRepository {
    private val _saved = MutableSharedFlow<String>(extraBufferCapacity = 16)
    override val saved: SharedFlow<String> = _saved

    override suspend fun save(movieId: String, positionSeconds: Double): DataResult<Unit> = try {
        client.from("watch_progress").upsert(
            buildJsonObject {
                put("movie_id", movieId)
                // numeric(10,3): milisegundos, como la web
                put("position_seconds", round(positionSeconds.coerceAtLeast(0.0) * 1000) / 1000)
            },
        ) { onConflict = "user_id,movie_id" }
        // Quien muestre ese progreso (detalle, "Seguir viendo") se recarga, aunque ya esté en pantalla
        _saved.tryEmit(movieId)
        DataResult.Success(Unit)
    } catch (e: CancellationException) {
        throw e
    } catch (e: Throwable) {
        DataResult.Failure(e.toDataError())
    }
}
