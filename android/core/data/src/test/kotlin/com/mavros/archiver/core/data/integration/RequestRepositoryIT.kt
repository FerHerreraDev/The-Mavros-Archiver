package com.mavros.archiver.core.data.integration

import com.mavros.archiver.core.data.DataResult
import com.mavros.archiver.core.data.RequestResult
import com.mavros.archiver.core.data.SupabaseAuthRepository
import com.mavros.archiver.core.data.SupabaseRequestRepository
import com.mavros.archiver.core.data.createMavrosSupabase
import io.github.jan.supabase.auth.MemorySessionManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.runBlocking
import org.junit.AfterClass
import org.junit.Test
import kotlin.test.assertEquals

/** REQ-02 / REQ-03 desde Android contra Supabase local: mismas reglas que la web */
class RequestRepositoryIT {
    companion object {
        private val users = mutableListOf<String>()
        @AfterClass @JvmStatic fun cleanup() = runBlocking<Unit> { LocalSupabase.deleteUsers(*users.toTypedArray()) }
    }

    /** Un usuario nuevo por prueba: los límites de REQ-02 son por usuario */
    private suspend fun repo(): SupabaseRequestRepository {
        val user = LocalSupabase.createUser("and-req").also { users += it.id }
        val client = createMavrosSupabase(LocalSupabase.config, MemorySessionManager())
        LocalSupabase.signIn(client, user)
        return SupabaseRequestRepository(client, SupabaseAuthRepository(client, CoroutineScope(SupervisorJob() + Dispatchers.Default)))
    }

    @Test fun `REQ-03 pedir crea el pedido y el mismo titulo pendiente otra vez es duplicado`() = runBlocking {
        val requests = repo()
        assertEquals(DataResult.Success(RequestResult.Sent), requests.request("  Blade   Runner "))
        assertEquals(DataResult.Success(RequestResult.Duplicate), requests.request("blade runner"))
    }

    @Test fun `REQ-02 mas de 20 pendientes se rechaza`() = runBlocking {
        val requests = repo()
        repeat(20) { requests.request("Pendiente $it") }
        assertEquals(DataResult.Success(RequestResult.TooMany), requests.request("La que sobra"))
    }
}
