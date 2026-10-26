package com.mavros.archiver.core.data

import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Lo que muestra la tele mientras espera (TV-01, DEV-01) */
data class DeviceCode(
    val deviceCode: String,
    val userCode: String,
    val verificationUri: String,
    val verificationUriComplete: String,
    val expiresInSeconds: Int,
    val intervalSeconds: Int,
)

/** Sesión que entrega /api/device/token al aprobarse (DEV-04) */
data class DeviceTokens(val accessToken: String, val refreshToken: String, val expiresAtEpochSeconds: Long)

/** Respuestas del sondeo (DEV-02, DEV-04, DEV-05) */
sealed interface DevicePoll {
    data object Pending : DevicePoll
    data object SlowDown : DevicePoll
    data class Approved(val tokens: DeviceTokens) : DevicePoll
    data object Denied : DevicePoll
    data object Expired : DevicePoll
    data object Invalid : DevicePoll
}

interface DeviceAuthRepository {
    suspend fun requestCode(clientName: String): DataResult<DeviceCode>
    suspend fun poll(deviceCode: String): DataResult<DevicePoll>

    companion object {
        /** RFC 8628 §3.5: ante slow_down el intervalo crece 5 s y se queda así */
        const val SLOW_DOWN_STEP_SECONDS = 5
    }
}

/** Habla con /api/device/code y /api/device/token de la web (fase A1). Sin sesión: la tele aún no tiene ninguna. */
class HttpDeviceAuthRepository(
    private val config: MavrosConfig,
    private val http: HttpClient = HttpClient(OkHttp),
) : DeviceAuthRepository {
    private val json = Json { ignoreUnknownKeys = true }
    private val base get() = config.siteUrl.trimEnd('/')

    @Serializable
    private data class CodeBody(
        @SerialName("device_code") val deviceCode: String,
        @SerialName("user_code") val userCode: String,
        @SerialName("verification_uri") val verificationUri: String,
        @SerialName("verification_uri_complete") val verificationUriComplete: String,
        @SerialName("expires_in") val expiresIn: Int,
        val interval: Int,
    )

    @Serializable
    private data class TokenBody(
        @SerialName("access_token") val accessToken: String,
        @SerialName("refresh_token") val refreshToken: String,
        @SerialName("expires_at") val expiresAt: Long,
    )

    @Serializable
    private data class ErrorBody(val error: String)

    override suspend fun requestCode(clientName: String): DataResult<DeviceCode> = call {
        val res = http.post("$base/api/device/code") {
            contentType(ContentType.Application.Json)
            setBody(buildJsonObject { put("client_name", clientName) }.toString())
        }
        if (res.status != HttpStatusCode.OK) {
            System.err.println("[Mavros] /api/device/code respondió ${res.status.value}") // p. ej. 429 = demasiados intentos
            return@call DataResult.Failure(DataError.Server)
        }
        val b = json.decodeFromString<CodeBody>(res.bodyAsText())
        DataResult.Success(DeviceCode(b.deviceCode, b.userCode, b.verificationUri, b.verificationUriComplete, b.expiresIn, b.interval))
    }

    override suspend fun poll(deviceCode: String): DataResult<DevicePoll> = call {
        val res = http.post("$base/api/device/token") {
            contentType(ContentType.Application.Json)
            setBody(buildJsonObject { put("device_code", deviceCode) }.toString())
        }
        val body = res.bodyAsText()
        if (res.status == HttpStatusCode.OK) {
            val t = json.decodeFromString<TokenBody>(body)
            return@call DataResult.Success(DevicePoll.Approved(DeviceTokens(t.accessToken, t.refreshToken, t.expiresAt)))
        }
        val error = runCatching { json.decodeFromString<ErrorBody>(body).error }.getOrNull()
        when (error) {
            "authorization_pending" -> DataResult.Success(DevicePoll.Pending)
            "slow_down" -> DataResult.Success(DevicePoll.SlowDown)
            "access_denied" -> DataResult.Success(DevicePoll.Denied)
            "expired_token" -> DataResult.Success(DevicePoll.Expired)
            "invalid_grant" -> DataResult.Success(DevicePoll.Invalid)
            else -> DataResult.Failure(DataError.Server)
        }
    }

    private inline fun <T> call(block: () -> DataResult<T>): DataResult<T> = try {
        block()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Throwable) {
        // Diagnóstico en logcat (System.err): tipo y mensaje del error, nunca tokens ni cuerpos
        System.err.println("[Mavros] /api/device falló: ${e::class.simpleName}: ${e.message}")
        DataResult.Failure(e.toDataError())
    }
}
