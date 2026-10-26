package com.mavros.archiver.core.model

/**
 * Reglas de progreso (PRG-02, CAT-06). Deben dar lo mismo que lib/progress.ts de la web:
 * las dos implementaciones se prueban con tests/fixtures/progress-cases.json (MOB-10).
 */
object ProgressRules {
    const val RESUME_MIN_SECONDS = 10.0
    const val FINISHED_RATIO = 0.95
    const val CONTINUE_MIN_RATIO = 0.05

    /** Desde dónde arrancar al abrir la película */
    fun resumePosition(positionSeconds: Double?, durationSeconds: Int): Double {
        if (positionSeconds == null || positionSeconds == 0.0 || durationSeconds <= 0) return 0.0
        if (positionSeconds < RESUME_MIN_SECONDS) return 0.0
        if (positionSeconds / durationSeconds >= FINISHED_RATIO) return 0.0
        return minOf(positionSeconds, durationSeconds.toDouble())
    }

    /** ¿Va en "Seguir viendo"? Entre 5 % y 95 % */
    fun isInProgress(positionSeconds: Double, durationSeconds: Int): Boolean {
        if (durationSeconds <= 0) return false
        val ratio = positionSeconds / durationSeconds
        return ratio >= CONTINUE_MIN_RATIO && ratio < FINISHED_RATIO
    }

    fun progressRatio(positionSeconds: Double, durationSeconds: Int): Float {
        if (durationSeconds <= 0) return 0f
        return (positionSeconds / durationSeconds).coerceIn(0.0, 1.0).toFloat()
    }
}
