package com.mavros.archiver.core.data

import com.mavros.archiver.core.model.LoginValidation
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.SignOutScope
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.auth.status.SessionStatus
import io.github.jan.supabase.exceptions.RestException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

sealed interface SessionState {
    data object Loading : SessionState
    data object SignedOut : SessionState
    data class SignedIn(val userId: String, val email: String?) : SessionState
}

enum class LoginError { InvalidCredentials, Network }

interface AuthRepository {
    val session: StateFlow<SessionState>
    suspend fun signIn(email: String, password: String): LoginError?
    suspend fun signOut()

    /** Pregunta al servidor si la sesión sigue valiendo; si no, la borra (MOB-06) */
    suspend fun validateSession(): Boolean

    /** Un endpoint respondió 401/403 con esta sesión: se trata como sesión inválida (MOB-06) */
    suspend fun onUnauthorized()
}

class SupabaseAuthRepository(
    private val client: SupabaseClient,
    scope: CoroutineScope,
) : AuthRepository {

    override val session: StateFlow<SessionState> = client.auth.sessionStatus
        .map { status ->
            when (status) {
                is SessionStatus.Authenticated -> SessionState.SignedIn(status.session.user?.id ?: "", status.session.user?.email)
                is SessionStatus.NotAuthenticated -> SessionState.SignedOut
                // Sin red al renovar: la sesión guardada sigue siendo la del usuario
                is SessionStatus.RefreshFailure -> client.auth.currentUserOrNull()?.let { SessionState.SignedIn(it.id, it.email) }
                    ?: SessionState.SignedOut
                SessionStatus.Initializing -> SessionState.Loading
            }
        }
        .stateIn(scope, SharingStarted.Eagerly, SessionState.Loading)

    /**
     * MOB-03: credenciales malas, usuario desactivado o invitado sin contraseña dan el MISMO error,
     * para no revelar si la cuenta existe. Solo la falta de red se distingue.
     */
    override suspend fun signIn(email: String, password: String): LoginError? = try {
        client.auth.signInWith(Email) {
            this.email = LoginValidation.normalizeEmail(email)
            this.password = password
        }
        null
    } catch (e: RestException) {
        LoginError.InvalidCredentials
    } catch (e: Throwable) {
        if (e.toDataError() == DataError.Network) LoginError.Network else LoginError.InvalidCredentials
    }

    override suspend fun signOut() {
        runCatching { client.auth.signOut(SignOutScope.LOCAL) }
        // Aunque el servidor no responda, la sesión local se borra (MOB-05)
        client.auth.clearSession()
    }

    override suspend fun validateSession(): Boolean {
        if (client.auth.currentSessionOrNull() == null) return false
        return try {
            client.auth.retrieveUserForCurrentSession(updateSession = true)
            true
        } catch (e: RestException) {
            client.auth.clearSession()
            false
        } catch (e: Throwable) {
            // Sin red no se cierra la sesión: se vuelve a validar más tarde
            true
        }
    }

    override suspend fun onUnauthorized() {
        if (!validateSession()) client.auth.clearSession()
    }
}
