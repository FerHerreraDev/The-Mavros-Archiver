package com.mavros.archiver.core.model

import java.net.URI

/** Reglas del reproductor (MOB-15, MOB-16). Puras: se prueban sin Android ni red. */
object PlaybackRules {
    /** Se pide URL nueva 5 min antes de que caduque el token (igual que la web) */
    const val REFRESH_BEFORE_MS = 5 * 60 * 1000L

    private val TOKEN_PATH = Regex("^/t/[^/]+/")

    /** Cuánto esperar para renovar el token. 0 = ya toca. */
    fun refreshDelayMs(expiresAtMs: Long, nowMs: Long): Long = maxOf(0L, expiresAtMs - nowMs - REFRESH_BEFORE_MS)

    /**
     * Cambia el token de una URL del Worker por el de la URL firmada más reciente, igual que
     * lib/video/swap-token.ts (casos compartidos en tests/fixtures/swap-token-cases.json):
     *   https://cdn/t/<viejo>/movies/x/720p/seg_1.ts + https://cdn/t/<nuevo>/movies/x/master.m3u8
     *   -> https://cdn/t/<nuevo>/movies/x/720p/seg_1.ts
     * Solo toca URLs del mismo origen con forma /t/<token>/…; cualquier otra se deja igual.
     */
    fun swapToken(requestUrl: String, latestSignedUrl: String): String {
        val request = parse(requestUrl) ?: return requestUrl
        val latest = parse(latestSignedUrl) ?: return requestUrl
        if (origin(request) != origin(latest)) return requestUrl

        val latestToken = TOKEN_PATH.find(latest.rawPath.orEmpty())?.value ?: return requestUrl
        val path = request.rawPath.orEmpty()
        if (!TOKEN_PATH.containsMatchIn(path)) return requestUrl

        val swapped = path.replaceFirst(TOKEN_PATH, latestToken)
        return buildString {
            append(request.scheme).append("://").append(request.rawAuthority).append(swapped)
            request.rawQuery?.let { append('?').append(it) }
            request.rawFragment?.let { append('#').append(it) }
        }
    }

    private fun parse(url: String): URI? = runCatching { URI(url) }.getOrNull()?.takeIf { it.scheme != null && it.host != null }

    private fun origin(uri: URI): String {
        val port = if (uri.port != -1) uri.port else if (uri.scheme.equals("https", true)) 443 else 80
        return "${uri.scheme.lowercase()}://${uri.host.lowercase()}:$port"
    }
}

/**
 * Cuándo guardar el progreso (MOB-15, PRG-01, PRG-06). Devuelve la posición a guardar o null.
 *
 * - Cada [saveEveryMs] mientras reproduce, al pausar y al salir.
 * - Hasta que el video arrancó de verdad no guarda nada: la posición 0 de antes de saltar al
 *   punto de reanudación nunca debe pisar el progreso guardado.
 * - Nunca guarda 0, la misma posición dos veces, ni fuera de 0…duración.
 */
class ProgressTracker(private val durationSeconds: Int, private val saveEveryMs: Long = 10_000) {
    private var started = false
    private var lastSaved: Double? = null
    private var lastSaveAtMs: Long? = null

    /** El reproductor empezó a reproducir (isPlaying = true) */
    fun onPlaying(nowMs: Long) {
        started = true
        if (lastSaveAtMs == null) lastSaveAtMs = nowMs
    }

    fun onTick(positionSeconds: Double, isPlaying: Boolean, nowMs: Long): Double? {
        if (!started || !isPlaying) return null
        val since = nowMs - (lastSaveAtMs ?: nowMs)
        return if (since >= saveEveryMs) commit(positionSeconds, nowMs) else null
    }

    fun onPause(positionSeconds: Double, nowMs: Long): Double? = if (started) commit(positionSeconds, nowMs) else null

    fun onExit(positionSeconds: Double, nowMs: Long): Double? = onPause(positionSeconds, nowMs)

    private fun commit(positionSeconds: Double, nowMs: Long): Double? {
        if (positionSeconds.isNaN()) return null
        val position = positionSeconds.coerceIn(0.0, durationSeconds.toDouble().coerceAtLeast(0.0))
        if (position <= 0.0 || position == lastSaved) return null
        lastSaved = position
        lastSaveAtMs = nowMs
        return position
    }
}
