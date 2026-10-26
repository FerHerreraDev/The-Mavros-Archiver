package com.mavros.archiver.core.data

import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.TextContent
import kotlinx.coroutines.runBlocking
import java.io.IOException
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

/** TV-01 / TV-03 / DEV-01..05: la tele habla con /api/device/code y /api/device/token */
class DeviceAuthRepositoryTest {
    private val config = MavrosConfig("http://127.0.0.1:9", "anon", "https://mavros.test")

    private fun repo(engine: MockEngine) = HttpDeviceAuthRepository(config, HttpClient(engine))

    @Test fun `pide el codigo con el nombre de la tele y lo lee completo`() = runBlocking {
        val engine = MockEngine {
            respond(
                """{"device_code":"dc","user_code":"ABCD-EFGH","verification_uri":"https://mavros.test/link","verification_uri_complete":"https://mavros.test/link?code=ABCD-EFGH","expires_in":600,"interval":5}""",
                HttpStatusCode.OK,
            )
        }
        val code = assertIs<DataResult.Success<DeviceCode>>(repo(engine).requestCode("Hisense Google TV")).value
        assertEquals(DeviceCode("dc", "ABCD-EFGH", "https://mavros.test/link", "https://mavros.test/link?code=ABCD-EFGH", 600, 5), code)
        val req = engine.requestHistory.single()
        assertEquals("https://mavros.test/api/device/code", req.url.toString())
        assertEquals("""{"client_name":"Hisense Google TV"}""", (req.body as TextContent).text)
    }

    @Test fun `cada respuesta del sondeo se entiende`() = runBlocking {
        val cases = mapOf(
            "authorization_pending" to DevicePoll.Pending,
            "slow_down" to DevicePoll.SlowDown,
            "access_denied" to DevicePoll.Denied,
            "expired_token" to DevicePoll.Expired,
            "invalid_grant" to DevicePoll.Invalid,
        )
        for ((error, expected) in cases) {
            val engine = MockEngine { respond("""{"error":"$error"}""", HttpStatusCode.BadRequest) }
            assertEquals(expected, assertIs<DataResult.Success<DevicePoll>>(repo(engine).poll("dc")).value, error)
        }
    }

    @Test fun `aprobado - entrega los tokens y manda el device_code en el cuerpo`() = runBlocking {
        val engine = MockEngine {
            respond("""{"access_token":"a","refresh_token":"r","expires_at":1792999999,"token_type":"bearer","user":{"id":"u"}}""", HttpStatusCode.OK)
        }
        val poll = assertIs<DataResult.Success<DevicePoll>>(repo(engine).poll("secreto")).value
        assertEquals(DevicePoll.Approved(DeviceTokens("a", "r", 1792999999)), poll)
        assertEquals("""{"device_code":"secreto"}""", (engine.requestHistory.single().body as TextContent).text)
        assertEquals("https://mavros.test/api/device/token", engine.requestHistory.single().url.toString())
    }

    @Test fun `sin red y errores desconocidos`() = runBlocking {
        assertEquals(DataError.Network, assertIs<DataResult.Failure>(repo(MockEngine { throw IOException("x") }).poll("dc")).error)
        assertEquals(DataError.Server, assertIs<DataResult.Failure>(repo(MockEngine { respond("""{"error":"server_error"}""", HttpStatusCode.InternalServerError) }).poll("dc")).error)
        assertEquals(DataError.Server, assertIs<DataResult.Failure>(repo(MockEngine { respond("oops", HttpStatusCode.TooManyRequests) }).requestCode("tv")).error)
    }
}
