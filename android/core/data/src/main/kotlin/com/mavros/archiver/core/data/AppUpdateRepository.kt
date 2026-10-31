package com.mavros.archiver.core.data

import com.mavros.archiver.core.model.AppRelease
import io.github.jan.supabase.SupabaseClient
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

interface AppUpdateRepository {
    /** Versión más nueva publicada de [app] (`mobile` o `tv`); null = no hay ninguna (UPD-03) */
    suspend fun latest(app: String): DataResult<AppRelease?>
}

/** Pregunta a `/api/app/latest` de la web con la sesión (UPD-03). Nunca cierra la sesión: solo informa. */
class HttpAppUpdateRepository(
    private val config: MavrosConfig,
    private val client: SupabaseClient,
    private val http: HttpClient = HttpClient(OkHttp),
) : AppUpdateRepository {
    private val json = Json { ignoreUnknownKeys = true }

    @Serializable
    private data class Response(
        @SerialName("version_code") val versionCode: Int,
        @SerialName("version_name") val versionName: String,
        val sha256: String,
        val url: String,
    )

    override suspend fun latest(app: String): DataResult<AppRelease?> = try {
        val (status, body) = authorizedGet(client, http, "${config.siteUrl.trimEnd('/')}/api/app/latest?app=$app")
        when (status) {
            HttpStatusCode.OK -> json.decodeFromString<Response>(body).let {
                DataResult.Success(AppRelease(it.versionCode, it.versionName, it.sha256.lowercase(), it.url))
            }
            HttpStatusCode.NoContent -> DataResult.Success(null)
            HttpStatusCode.Unauthorized -> DataResult.Failure(DataError.Unauthorized)
            else -> DataResult.Failure(DataError.Server)
        }
    } catch (e: CancellationException) {
        throw e
    } catch (e: Throwable) {
        DataResult.Failure(e.toDataError())
    }
}
