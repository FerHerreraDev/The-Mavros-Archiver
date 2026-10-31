package com.mavros.archiver.core.data

import io.github.jan.supabase.auth.MemorySessionManager
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.user.UserSession
import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.client.engine.mock.respondError
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.headersOf
import kotlinx.coroutines.runBlocking
import java.io.IOException
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.time.Clock
import kotlin.time.Duration.Companion.hours

/** UPD-03 / UPD-04: la app pregunta por su versión más nueva con su sesión */
class AppUpdateRepositoryTest {
    private val config = MavrosConfig("http://127.0.0.1:9", "anon", "https://mavros.test/")

    private fun repo(engine: MockEngine, withSession: Boolean = true): HttpAppUpdateRepository {
        val client = createMavrosSupabase(config, MemorySessionManager())
        if (withSession) runBlocking {
            client.auth.importSession(
                UserSession(accessToken = "tok-123", refreshToken = "r", expiresIn = 3600, tokenType = "bearer", user = null, expiresAt = Clock.System.now() + 1.hours),
                autoRefresh = false,
            )
        }
        return HttpAppUpdateRepository(config, client, HttpClient(engine))
    }

    @Test fun `pide la app con Bearer y lee la version`() = runBlocking {
        val engine = MockEngine {
            respond(
                """{"version_code":7,"version_name":"1.3.0","sha256":"${"AB".repeat(32)}","url":"https://s.test/apk?token=x","extra":1}""",
                HttpStatusCode.OK,
                headersOf(HttpHeaders.ContentType, "application/json"),
            )
        }
        val result = repo(engine).latest("tv")
        val release = assertIs<DataResult.Success<com.mavros.archiver.core.model.AppRelease?>>(result).value!!
        assertEquals(7, release.versionCode)
        assertEquals("1.3.0", release.versionName)
        assertEquals("ab".repeat(32), release.sha256)
        assertEquals("https://s.test/apk?token=x", release.url)
        val request = engine.requestHistory.single()
        assertEquals("https://mavros.test/api/app/latest?app=tv", request.url.toString())
        assertEquals("Bearer tok-123", request.headers[HttpHeaders.Authorization])
    }

    @Test fun `204 es que no hay versiones`() = runBlocking {
        val result = repo(MockEngine { respond("", HttpStatusCode.NoContent) }).latest("mobile")
        assertEquals(DataResult.Success(null), result)
    }

    @Test fun `sin red, error del servidor o sin sesion son fallas (la app sigue normal)`() = runBlocking {
        assertEquals(DataResult.Failure(DataError.Network), repo(MockEngine { throw IOException("sin red") }).latest("tv"))
        assertEquals(DataResult.Failure(DataError.Server), repo(MockEngine { respondError(HttpStatusCode.InternalServerError) }).latest("tv"))
        val noSession = MockEngine { respond("", HttpStatusCode.OK) }
        assertEquals(DataResult.Failure(DataError.Unauthorized), repo(noSession, withSession = false).latest("tv"))
        assertEquals(0, noSession.requestHistory.size)
    }
}
