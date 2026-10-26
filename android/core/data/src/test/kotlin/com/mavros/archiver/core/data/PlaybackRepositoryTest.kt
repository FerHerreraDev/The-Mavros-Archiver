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
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.runBlocking
import java.io.IOException
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.time.Clock
import kotlin.time.Duration.Companion.hours

/** MOB-13 / PLY-06..08: la app pide la URL firmada a la web con su access token */
class PlaybackRepositoryTest {
    private val config = MavrosConfig("http://127.0.0.1:9", "anon", "https://mavros.test/")
    private val movieId = "d85a1225-3a8b-45c9-822a-caa3152fecc0"

    private class FakeAuth(var valid: Boolean = false) : AuthRepository {
        var unauthorized = 0
        override val session: StateFlow<SessionState> = MutableStateFlow(SessionState.SignedIn("u", "u@test"))
        override suspend fun signIn(email: String, password: String) = null
        override suspend fun signOut() {}
        override suspend fun validateSession() = valid
        override suspend fun onUnauthorized() { unauthorized++ }
        override suspend fun signInWithTokens(tokens: DeviceTokens) = false
    }

    private fun repo(auth: AuthRepository = FakeAuth(), withSession: Boolean = true, engine: MockEngine): HttpPlaybackRepository {
        val client = createMavrosSupabase(config, MemorySessionManager())
        if (withSession) runBlocking {
            client.auth.importSession(
                UserSession(accessToken = "tok-123", refreshToken = "r", expiresIn = 3600, tokenType = "bearer", user = null, expiresAt = Clock.System.now() + 1.hours),
                autoRefresh = false,
            )
        }
        return HttpPlaybackRepository(config, client, auth, HttpClient(engine))
    }

    private fun ok() = MockEngine { request ->
        respond(
            """{"url":"https://cdn.test/t/TOKEN/movies/x/master.m3u8","expires_at":"2026-10-26T04:00:00.000Z","extra":1}""",
            HttpStatusCode.OK,
            headersOf(HttpHeaders.ContentType, "application/json"),
        )
    }

    @Test fun `envia el access token como Bearer a la ruta de la pelicula y lee url y caducidad`() = runBlocking {
        val engine = ok()
        val result = repo(engine = engine).source(movieId)
        val req = engine.requestHistory.single()
        assertEquals("https://mavros.test/api/playback/$movieId", req.url.toString())
        assertEquals("Bearer tok-123", req.headers[HttpHeaders.Authorization])
        val source = assertIs<DataResult.Success<PlaybackSource?>>(result).value!!
        assertEquals("https://cdn.test/t/TOKEN/movies/x/master.m3u8", source.url)
        assertEquals(java.time.Instant.parse("2026-10-26T04:00:00Z").toEpochMilli(), source.expiresAtMs)
    }

    @Test fun `404 - no disponible (null), no es error`() = runBlocking {
        val result = repo(engine = MockEngine { respondError(HttpStatusCode.NotFound) }).source(movieId)
        assertNull(assertIs<DataResult.Success<PlaybackSource?>>(result).value)
    }

    @Test fun `401 con sesion invalida - Unauthorized y avisa al auth`() = runBlocking {
        val auth = FakeAuth(valid = false)
        val engine = MockEngine { respondError(HttpStatusCode.Unauthorized) }
        val result = repo(auth, engine = engine).source(movieId)
        assertEquals(DataError.Unauthorized, assertIs<DataResult.Failure>(result).error)
        assertEquals(1, auth.unauthorized)
        assertEquals(1, engine.requestHistory.size, "sesión inválida: no reintenta")
    }

    @Test fun `401 pero la sesion sigue valida (token renovado) - reintenta una vez`() = runBlocking {
        var calls = 0
        val engine = MockEngine {
            calls++
            if (calls == 1) respondError(HttpStatusCode.Unauthorized)
            else respond("""{"url":"https://cdn.test/t/T/m/master.m3u8","expires_at":"2026-10-26T04:00:00Z"}""", HttpStatusCode.OK)
        }
        val result = repo(FakeAuth(valid = true), engine = engine).source(movieId)
        assertIs<DataResult.Success<PlaybackSource?>>(result)
        assertEquals(2, engine.requestHistory.size)
    }

    @Test fun `error del servidor y sin red`() = runBlocking {
        val server = repo(engine = MockEngine { respondError(HttpStatusCode.InternalServerError) }).source(movieId)
        assertEquals(DataError.Server, assertIs<DataResult.Failure>(server).error)
        val offline = repo(engine = MockEngine { throw IOException("sin red") }).source(movieId)
        assertEquals(DataError.Network, assertIs<DataResult.Failure>(offline).error)
    }

    @Test fun `sin sesion - Unauthorized sin llamar a la web`() = runBlocking {
        val engine = ok()
        val result = repo(withSession = false, engine = engine).source(movieId)
        assertEquals(DataError.Unauthorized, assertIs<DataResult.Failure>(result).error)
        assertTrue(engine.requestHistory.isEmpty())
    }
}
