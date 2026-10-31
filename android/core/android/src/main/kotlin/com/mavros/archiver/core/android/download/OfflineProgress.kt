package com.mavros.archiver.core.android.download

import android.content.Context
import com.mavros.archiver.core.data.DataError
import com.mavros.archiver.core.data.DataResult
import com.mavros.archiver.core.data.ProgressRepository
import com.mavros.archiver.core.model.DownloadRules
import kotlinx.coroutines.flow.SharedFlow
import org.json.JSONObject

/** Última posición de cada película en este aparato y si falta mandarla al servidor (DL-04, DL-05) */
interface LocalProgress {
    fun position(movieId: String): Double?
    fun put(movieId: String, positionSeconds: Double, atMs: Long, pending: Boolean)
    fun markSent(movieId: String, atMs: Long)
    /** movieId → (posición, cuándo) de lo que falta mandar */
    fun pending(): Map<String, Pair<Double, Long>>
    fun clear()
}

class PrefsLocalProgress(context: Context) : LocalProgress {
    private val prefs = context.applicationContext.getSharedPreferences("mavros.offlineProgress", Context.MODE_PRIVATE)

    private fun read(id: String) = prefs.getString(id, null)?.let { runCatching { JSONObject(it) }.getOrNull() }

    override fun position(movieId: String) = read(movieId)?.optDouble("position")?.takeIf { !it.isNaN() }

    override fun put(movieId: String, positionSeconds: Double, atMs: Long, pending: Boolean) {
        prefs.edit().putString(movieId, JSONObject().put("position", positionSeconds).put("at", atMs).put("pending", pending).toString()).apply()
    }

    override fun markSent(movieId: String, atMs: Long) {
        val entry = read(movieId) ?: return
        // Solo si no se guardó algo más nuevo mientras tanto
        if (entry.optLong("at") <= atMs) prefs.edit().putString(movieId, entry.put("pending", false).toString()).apply()
    }

    override fun pending() = prefs.all.keys.mapNotNull { id ->
        read(id)?.takeIf { it.optBoolean("pending") }?.let { id to (it.optDouble("position") to it.optLong("at")) }
    }.toMap()

    override fun clear() = prefs.edit().clear().apply()
}

/**
 * Guarda el progreso como siempre y, además, en el aparato. Sin red queda pendiente y se manda
 * después con [flush], sin pisar un progreso más nuevo del servidor (DL-05).
 */
class OfflineAwareProgressRepository(
    private val inner: ProgressRepository,
    private val local: LocalProgress,
    /** updated_at (ms) que tiene el servidor para cada película; null si no se pudo preguntar */
    private val serverTimes: suspend (List<String>) -> Map<String, Long>?,
    private val now: () -> Long = System::currentTimeMillis,
) : ProgressRepository {
    override val saved: SharedFlow<String> get() = inner.saved

    override suspend fun save(movieId: String, positionSeconds: Double): DataResult<Unit> {
        val at = now()
        local.put(movieId, positionSeconds, at, pending = true)
        val result = inner.save(movieId, positionSeconds)
        if (result is DataResult.Success) local.markSent(movieId, at)
        // Un error que no es de red (sesión inválida, servidor) no se reintenta solo
        else if ((result as DataResult.Failure).error != DataError.Network) local.markSent(movieId, at)
        return result
    }

    fun position(movieId: String) = local.position(movieId)

    /** Al volver la conexión: manda lo visto sin internet que sea más nuevo que lo del servidor */
    suspend fun flush() {
        val pending = local.pending()
        if (pending.isEmpty()) return
        val server = serverTimes(pending.keys.toList()) ?: return
        for ((id, entry) in pending) {
            val (position, at) = entry
            if (DownloadRules.shouldUpload(at, server[id])) {
                if (inner.save(id, position) is DataResult.Success) local.markSent(id, at)
            } else {
                local.markSent(id, at)
            }
        }
    }

    fun clear() = local.clear()
}
