package com.mavros.archiver.core.data

import io.github.jan.supabase.auth.MemorySessionManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import java.net.ServerSocket
import kotlin.concurrent.thread
import kotlin.test.Test
import kotlin.test.assertNull

/**
 * MOB-12: cancelar una carga (la pantalla pidió otra) no es un error. Si el repositorio
 * convirtiera la cancelación en DataError.Server, la carga cancelada pintaría "Algo salió mal".
 */
class CancellationTest {
    /** Servidor que acepta la conexión y nunca responde: la petición queda suspendida */
    private fun silentServer(): ServerSocket = ServerSocket(0).also { server ->
        thread(isDaemon = true) {
            val held = mutableListOf<java.net.Socket>()
            runCatching { while (true) held += server.accept() }
        }
    }

    private fun repo(port: Int): SupabaseCatalogRepository {
        val config = MavrosConfig("http://127.0.0.1:$port", "anon-key-de-prueba", "http://localhost")
        val client = createMavrosSupabase(config, MemorySessionManager())
        return SupabaseCatalogRepository(client, SupabaseAuthRepository(client, CoroutineScope(SupervisorJob() + Dispatchers.Default)))
    }

    @Test
    fun `cancelar el catalogo no devuelve un error`() = runBlocking {
        silentServer().use { server ->
            val repo = repo(server.localPort)
            var result: DataResult<*>? = null
            val job = launch(Dispatchers.Default) { result = repo.catalog() }
            delay(500)
            job.cancelAndJoin()
            assertNull(result, "la carga cancelada devolvió $result")
        }
    }

    @Test
    fun `cancelar el detalle no devuelve un error`() = runBlocking {
        silentServer().use { server ->
            val repo = repo(server.localPort)
            var result: DataResult<*>? = null
            val job = launch(Dispatchers.Default) { result = repo.movie("00000000-0000-0000-0000-000000000000") }
            delay(500)
            job.cancelAndJoin()
            assertNull(result, "la carga cancelada devolvió $result")
        }
    }
}
