package com.mavros.archiver.core.android.download

import com.mavros.archiver.core.data.DataError
import com.mavros.archiver.core.data.DataResult
import com.mavros.archiver.core.data.ProgressRepository
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.runBlocking
import org.junit.Test
import kotlin.test.assertEquals

class OfflineProgressTest {
    private class MemoryLocal : LocalProgress {
        val entries = mutableMapOf<String, Triple<Double, Long, Boolean>>()
        override fun position(movieId: String) = entries[movieId]?.first
        override fun put(movieId: String, positionSeconds: Double, atMs: Long, pending: Boolean) { entries[movieId] = Triple(positionSeconds, atMs, pending) }
        override fun markSent(movieId: String, atMs: Long) { entries[movieId]?.let { if (it.second <= atMs) entries[movieId] = it.copy(third = false) } }
        override fun pending() = entries.filterValues { it.third }.mapValues { it.value.first to it.value.second }
        override fun clear() = entries.clear()
    }

    private class FakeServer(var online: Boolean = false) : ProgressRepository {
        val writes = mutableListOf<Pair<String, Double>>()
        override val saved: SharedFlow<String> = MutableSharedFlow()
        override suspend fun save(movieId: String, positionSeconds: Double): DataResult<Unit> {
            if (!online) return DataResult.Failure(DataError.Network)
            writes += movieId to positionSeconds
            return DataResult.Success(Unit)
        }
    }

    private var clock = 1_000L

    @Test fun `DL-05 sin red se guarda en el telefono y se manda al volver la conexion`() = runBlocking {
        val local = MemoryLocal()
        val server = FakeServer(online = false)
        var serverTimes: Map<String, Long>? = null
        val repo = OfflineAwareProgressRepository(server, local, { serverTimes }) { clock }

        assertEquals(DataResult.Failure(DataError.Network), repo.save("m", 120.0))
        assertEquals(120.0, repo.position("m"), "DL-04 se reanuda desde ahí sin internet")
        repo.flush() // sigue sin red: no pasa nada
        assertEquals(emptyList(), server.writes)

        server.online = true
        serverTimes = emptyMap()
        repo.flush()
        assertEquals(listOf("m" to 120.0), server.writes)
        repo.flush()
        assertEquals(1, server.writes.size, "ya no queda pendiente")
    }

    @Test fun `DL-05 no pisa un progreso mas nuevo del servidor`() = runBlocking {
        val local = MemoryLocal()
        val server = FakeServer(online = false)
        val repo = OfflineAwareProgressRepository(server, local, { mapOf("m" to 5_000L) }) { clock }
        repo.save("m", 300.0) // a las 1000, sin red
        server.online = true
        repo.flush()
        assertEquals(emptyList(), server.writes, "el servidor tiene algo de las 5000")
        assertEquals(emptyMap(), local.pending())
    }

    @Test fun `con red guarda normal y no deja pendientes`() = runBlocking {
        val local = MemoryLocal()
        val server = FakeServer(online = true)
        val repo = OfflineAwareProgressRepository(server, local, { emptyMap() }) { clock }
        repo.save("m", 60.0)
        assertEquals(listOf("m" to 60.0), server.writes)
        assertEquals(emptyMap(), local.pending())
        assertEquals(60.0, repo.position("m"))
    }
}
