package com.mavros.archiver.core.data.integration

import com.mavros.archiver.core.data.DeviceTokens
import com.mavros.archiver.core.data.LoginError
import com.mavros.archiver.core.data.SessionState
import com.mavros.archiver.core.data.SupabaseAuthRepository
import com.mavros.archiver.core.data.createMavrosSupabase
import com.mavros.archiver.core.data.integration.LocalSupabase.withRejectedAccessToken
import io.github.jan.supabase.auth.MemorySessionManager
import io.github.jan.supabase.auth.auth
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlin.time.Clock
import org.junit.AfterClass
import org.junit.BeforeClass
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNotEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** MOB-03..MOB-06 contra Supabase local */
class AuthRepositoryIT {
    companion object {
        private lateinit var user: LocalSupabase.TestUser
        private val created = mutableListOf<String>()

        @BeforeClass @JvmStatic fun setup() = runBlocking<Unit> {
            user = LocalSupabase.createUser("and-auth")
            created += user.id
        }

        @AfterClass @JvmStatic fun cleanup() = runBlocking<Unit> { LocalSupabase.deleteUsers(*created.toTypedArray()) }
    }

    private fun repo(sessionManager: MemorySessionManager = MemorySessionManager()): Pair<SupabaseAuthRepository, io.github.jan.supabase.SupabaseClient> {
        val client = createMavrosSupabase(LocalSupabase.config, sessionManager)
        return SupabaseAuthRepository(client, CoroutineScope(SupervisorJob() + Dispatchers.Default)) to client
    }

    private suspend fun SupabaseAuthRepository.awaitState(predicate: (SessionState) -> Boolean): SessionState =
        withTimeout(10_000) { session.first(predicate) }

    @Test fun `MOB-03 credenciales validas inician sesion`() = runBlocking<Unit> {
        val (repo, _) = repo()
        assertNull(repo.signIn(user.email, user.password))
        val state = repo.awaitState { it is SessionState.SignedIn }
        assertIs<SessionState.SignedIn>(state)
        assertEquals(user.id, state.userId)
    }

    @Test fun `MOB-03 el email se normaliza (espacios y mayusculas)`() = runBlocking<Unit> {
        val (repo, _) = repo()
        assertNull(repo.signIn("  ${user.email.uppercase()} ", user.password))
    }

    @Test fun `MOB-03 contrasena incorrecta y email inexistente dan el mismo error`() = runBlocking<Unit> {
        val (repo, _) = repo()
        val wrong = repo.signIn(user.email, "contrasena-incorrecta-123")
        val ghost = repo.signIn(LocalSupabase.uniqueEmail("nadie"), "contrasena-incorrecta-123")
        assertEquals(LoginError.InvalidCredentials, wrong)
        assertEquals(wrong, ghost)
        assertIs<SessionState.SignedOut>(repo.awaitState { it !is SessionState.Loading })
    }

    @Test fun `MOB-03 usuario desactivado e invitado sin contrasena dan el mismo error`() = runBlocking<Unit> {
        val banned = LocalSupabase.createUser("and-banned").also { created += it.id }
        LocalSupabase.ban(banned.id)
        val invited = LocalSupabase.inviteUser().also { created += it.id }

        val (repo, _) = repo()
        assertEquals(LoginError.InvalidCredentials, repo.signIn(banned.email, banned.password))
        assertEquals(LoginError.InvalidCredentials, repo.signIn(invited.email, invited.password))
    }

    @Test fun `MOB-03 sin red el error es Network, no credenciales`() = runBlocking<Unit> {
        val offline = com.mavros.archiver.core.data.MavrosConfig("http://127.0.0.1:9", LocalSupabase.anonKey, "http://localhost")
        val client = createMavrosSupabase(offline, MemorySessionManager())
        val repo = SupabaseAuthRepository(client, CoroutineScope(SupervisorJob() + Dispatchers.Default))
        assertEquals(LoginError.Network, repo.signIn(user.email, user.password))
    }

    @Test fun `MOB-04 la sesion guardada se recupera al abrir la app otra vez`() = runBlocking<Unit> {
        val storage = MemorySessionManager()
        val (first, _) = repo(storage)
        assertNull(first.signIn(user.email, user.password))
        first.awaitState { it is SessionState.SignedIn }

        // "Reabrir la app": cliente nuevo con el mismo almacenamiento, sin pedir contraseña
        val (second, _) = repo(storage)
        val state = second.awaitState { it !is SessionState.Loading }
        assertIs<SessionState.SignedIn>(state)
        assertEquals(user.id, state.userId)
    }

    @Test fun `MOB-04 token de acceso caducado - validar lo renueva, no cierra la sesion`() = runBlocking<Unit> {
        val storage = MemorySessionManager()
        val (repo, client) = repo(storage)
        assertNull(repo.signIn(user.email, user.password))
        repo.awaitState { it is SessionState.SignedIn }
        val expired = client.auth.currentSessionOrNull()!!.withRejectedAccessToken()
        client.auth.importSession(expired, autoRefresh = false)

        assertTrue(repo.validateSession(), "un token caducado no es una sesión inválida")
        val renewed = assertNotNull(client.auth.currentSessionOrNull(), "la sesión sigue")
        assertNotEquals(expired.accessToken, renewed.accessToken, "se renovó el token")
        assertEquals(user.id, renewed.user?.id)
        assertNotNull(runCatching { storage.loadSession() }.getOrNull(), "sigue guardada")
    }

    @Test fun `MOB-04 abrir la app con el token caducado - sigue dentro sin pedir contrasena`() = runBlocking<Unit> {
        val storage = MemorySessionManager()
        val (first, firstClient) = repo(storage)
        assertNull(first.signIn(user.email, user.password))
        first.awaitState { it is SessionState.SignedIn }
        storage.saveSession(firstClient.auth.currentSessionOrNull()!!.withRejectedAccessToken())

        // "Reabrir la app" como MainActivity: cliente nuevo y validateSession() de inmediato
        val (second, secondClient) = repo(storage)
        assertTrue(second.validateSession() || secondClient.auth.currentSessionOrNull() == null)
        val state = second.awaitState { it !is SessionState.Loading }
        assertIs<SessionState.SignedIn>(state)
        assertEquals(user.id, state.userId)
        // Ya renovada y guardada
        withTimeout(10_000) { while (secondClient.auth.currentSessionOrNull()?.expiresAt?.let { it < Clock.System.now() } != false) delay(100) }
        assertTrue(second.validateSession())
        assertNotNull(runCatching { storage.loadSession() }.getOrNull())
    }

    @Test fun `TV-02 la sesion recibida por codigo se guarda y funciona al reabrir`() = runBlocking<Unit> {
        // Sesión emitida para el usuario (como la que entrega /api/device/token)
        val issuer = createMavrosSupabase(LocalSupabase.config, MemorySessionManager())
        LocalSupabase.signIn(issuer, user)
        val s = issuer.auth.currentSessionOrNull()!!
        val tokens = DeviceTokens(s.accessToken, s.refreshToken, s.expiresAt.epochSeconds)

        val storage = MemorySessionManager()
        val (tv, _) = repo(storage)
        assertTrue(tv.signInWithTokens(tokens))
        assertEquals(user.id, assertIs<SessionState.SignedIn>(tv.awaitState { it is SessionState.SignedIn }).userId)

        val (reopened, _) = repo(storage)
        assertIs<SessionState.SignedIn>(reopened.awaitState { it !is SessionState.Loading })
    }

    @Test fun `TV-02 tokens invalidos - no entra y no deja sesion`() = runBlocking<Unit> {
        val storage = MemorySessionManager()
        val (tv, client) = repo(storage)
        assertFalse(tv.signInWithTokens(DeviceTokens("no.es.jwt", "no-existe", System.currentTimeMillis() / 1000 + 3600)))
        assertNull(client.auth.currentSessionOrNull())
    }

    @Test fun `MOB-05 cerrar sesion borra la sesion guardada`() = runBlocking<Unit> {
        val storage = MemorySessionManager()
        val (repo, _) = repo(storage)
        repo.signIn(user.email, user.password)
        repo.awaitState { it is SessionState.SignedIn }

        repo.signOut()
        assertIs<SessionState.SignedOut>(repo.awaitState { it is SessionState.SignedOut })
        // supabase-kt indica "no hay sesión" lanzando NoSessionFoundException (o devolviendo null)
        assertNull(runCatching { storage.loadSession() }.getOrNull())

        val (reopened, _) = repo(storage)
        assertIs<SessionState.SignedOut>(reopened.awaitState { it !is SessionState.Loading })
    }

    @Test fun `MOB-06 sesiones revocadas - validar la borra y vuelve al login`() = runBlocking<Unit> {
        val victim = LocalSupabase.createUser("and-revoked").also { created += it.id }
        val (repo, _) = repo()
        repo.signIn(victim.email, victim.password)
        repo.awaitState { it is SessionState.SignedIn }

        LocalSupabase.revokeSessions(victim.id)
        assertFalse(repo.validateSession())
        assertIs<SessionState.SignedOut>(repo.awaitState { it is SessionState.SignedOut })
    }

    @Test fun `MOB-06 usuario desactivado con sesion abierta - validar la borra`() = runBlocking<Unit> {
        val victim = LocalSupabase.createUser("and-banned-open").also { created += it.id }
        val (repo, _) = repo()
        repo.signIn(victim.email, victim.password)
        repo.awaitState { it is SessionState.SignedIn }

        LocalSupabase.ban(victim.id)
        assertFalse(repo.validateSession())
        assertIs<SessionState.SignedOut>(repo.awaitState { it is SessionState.SignedOut })
    }

    @Test fun `MOB-06 una sesion valida sigue valida`() = runBlocking<Unit> {
        val (repo, client) = repo()
        repo.signIn(user.email, user.password)
        repo.awaitState { it is SessionState.SignedIn }
        assertTrue(repo.validateSession())
        assertEquals(user.id, client.auth.currentUserOrNull()?.id)
    }
}
