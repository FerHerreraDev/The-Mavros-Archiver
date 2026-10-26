package com.mavros.archiver.mobile.login

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mavros.archiver.core.data.AuthRepository
import com.mavros.archiver.core.data.LoginError
import com.mavros.archiver.core.model.LoginValidation
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class LoginUiState(
    val email: String = "",
    val password: String = "",
    val emailError: String? = null,
    val passwordError: String? = null,
    val error: String? = null,
    val loading: Boolean = false,
) {
    /** Como en la web: el botón se habilita solo con email y contraseña escritos */
    val canSubmit get() = !loading && email.isNotBlank() && password.isNotEmpty()
}

const val INVALID_CREDENTIALS_MESSAGE = "Email o contraseña incorrectos."
const val NETWORK_MESSAGE = "Sin conexión. Revisa tu internet e intenta de nuevo."

class LoginViewModel(private val auth: AuthRepository) : ViewModel() {
    private val _state = MutableStateFlow(LoginUiState())
    val state: StateFlow<LoginUiState> = _state

    fun onEmail(value: String) = _state.update { it.copy(email = value, emailError = null, error = null) }
    fun onPassword(value: String) = _state.update { it.copy(password = value, passwordError = null, error = null) }

    fun submit() {
        val current = _state.value
        if (!current.canSubmit) return

        // Validación previa (MOB-03): no se llama al servidor con datos inválidos
        val errors = LoginValidation.validate(current.email, current.password)
        if (!errors.isValid) {
            _state.update { it.copy(emailError = errors.email, passwordError = errors.password) }
            return
        }

        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            val error = auth.signIn(current.email, current.password)
            // Si sale bien, la sesión cambia y la navegación lleva al catálogo
            _state.update {
                it.copy(
                    loading = false,
                    error = when (error) {
                        null -> null
                        LoginError.InvalidCredentials -> INVALID_CREDENTIALS_MESSAGE
                        LoginError.Network -> NETWORK_MESSAGE
                    },
                )
            }
        }
    }
}
