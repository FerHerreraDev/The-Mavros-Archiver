package com.mavros.archiver.core.android.update

/** Textos de la pantalla de actualización, iguales en teléfono y tele (UPD-04, UPD-05) */
object UpdateTexts {
    const val TITLE = "Hay una versión nueva"
    fun body(versionName: String) = "Instala la versión $versionName para seguir usando Mavros."
    const val INSTALL = "Instalar"
    const val RETRY = "Reintentar"
    const val PERMISSION =
        "Para instalarla, permite que Mavros instale apps: en Ajustes activa \"Permitir de esta fuente\" y regresa aquí."
    const val OPEN_SETTINGS = "Abrir ajustes"
    const val INSTALLING = "Abriendo el instalador…"

    fun downloading(progress: Float?) = progress?.let { "Descargando… ${(it * 100).toInt()} %" } ?: "Descargando…"

    fun problem(problem: UpdateProblem) = when (problem) {
        UpdateProblem.Network -> "No se pudo descargar. Revisa tu internet."
        UpdateProblem.Corrupt -> "La descarga llegó dañada."
        UpdateProblem.InstallFailed -> "No se pudo instalar."
    }
}
