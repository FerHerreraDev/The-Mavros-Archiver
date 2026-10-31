package com.mavros.archiver.core.model

import java.net.URI

/** Reglas de las descargas para ver sin internet (DL-01, DL-05, DL-07). Puras. */
object DownloadRules {
    /** Calidad máxima que se descarga: buena en el teléfono sin llenar la memoria */
    const val MAX_HEIGHT = 720

    private val TOKEN_PATH = Regex("^/t/[^/]+/")

    /** DL-01: la altura más cercana a 720p sin pasarse; si todas son más altas, la más baja */
    fun pickHeight(heights: List<Int>): Int? {
        val valid = heights.filter { it > 0 }
        return valid.filter { it <= MAX_HEIGHT }.maxOrNull() ?: valid.minOrNull()
    }

    /**
     * DL-07: clave de caché sin el token: https://cdn/t/<token>/movies/x/seg_1.ts → https://cdn/movies/x/seg_1.ts.
     * Así la misma película bajada (o vista) con enlaces distintos ocupa un solo lugar.
     */
    fun cacheKey(url: String): String {
        val uri = runCatching { URI(url) }.getOrNull() ?: return url
        val path = uri.rawPath ?: return url
        if (uri.scheme == null || uri.rawAuthority == null || !TOKEN_PATH.containsMatchIn(path)) return url
        return buildString {
            append(uri.scheme).append("://").append(uri.rawAuthority).append(path.replaceFirst(TOKEN_PATH, "/"))
            uri.rawQuery?.let { append('?').append(it) }
        }
    }

    /** Carpeta de la película en el Worker (sin token): lo que tienen en común todas sus URLs */
    fun folderKey(url: String): String? {
        val key = cacheKey(url)
        val slash = key.lastIndexOf('/')
        return if (slash > 0 && key != url) key.substring(0, slash + 1) else null
    }

    /**
     * DL-05: un progreso visto sin internet se manda al servidor solo si es más nuevo que el del servidor.
     * [serverUpdatedAtMs] null = el servidor no tiene progreso de esa película.
     */
    fun shouldUpload(localUpdatedAtMs: Long, serverUpdatedAtMs: Long?): Boolean =
        serverUpdatedAtMs == null || localUpdatedAtMs > serverUpdatedAtMs
}
