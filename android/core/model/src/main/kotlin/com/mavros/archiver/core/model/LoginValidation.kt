package com.mavros.archiver.core.model

/** Validación previa del login (MOB-03), con las mismas reglas que loginSchema de la web */
object LoginValidation {
    private val EMAIL = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")
    const val MIN_PASSWORD = 8

    data class Errors(val email: String? = null, val password: String? = null) {
        val isValid get() = email == null && password == null
    }

    /** El email se normaliza igual que en la web: sin espacios alrededor y en minúsculas */
    fun normalizeEmail(email: String) = email.trim().lowercase()

    fun validate(email: String, password: String): Errors = Errors(
        email = when {
            normalizeEmail(email).isEmpty() -> "El email es requerido"
            !EMAIL.matches(normalizeEmail(email)) -> "Email inválido"
            else -> null
        },
        password = when {
            password.isEmpty() -> "La contraseña es requerida"
            password.length < MIN_PASSWORD -> "La contraseña debe tener al menos $MIN_PASSWORD caracteres"
            else -> null
        },
    )
}
