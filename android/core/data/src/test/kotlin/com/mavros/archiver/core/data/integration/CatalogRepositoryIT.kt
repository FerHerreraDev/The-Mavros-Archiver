package com.mavros.archiver.core.data.integration

import com.mavros.archiver.core.data.DataResult
import com.mavros.archiver.core.data.SupabaseAuthRepository
import com.mavros.archiver.core.data.SupabaseCatalogRepository
import com.mavros.archiver.core.data.createMavrosSupabase
import com.mavros.archiver.core.model.Catalog
import com.mavros.archiver.core.data.integration.LocalSupabase.withRejectedAccessToken
import io.github.jan.supabase.auth.MemorySessionManager
import io.github.jan.supabase.auth.auth
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.runBlocking
import org.junit.AfterClass
import org.junit.BeforeClass
import org.junit.Test
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * MOB-07 / MOB-08 contra Supabase local. Otras pruebas crean películas en paralelo:
 * se comprueban las propias (por id), nunca totales.
 */
class CatalogRepositoryIT {
    companion object {
        private val tag = UUID.randomUUID().toString().take(6)
        private val genre = "genero-and-$tag"
        private lateinit var viewer: LocalSupabase.TestUser
        private lateinit var boss: LocalSupabase.TestUser
        private val ids = mutableMapOf<String, String>()

        @BeforeClass @JvmStatic fun setup() = runBlocking<Unit> {
            viewer = LocalSupabase.createUser("and-cat")
            boss = LocalSupabase.createUser("and-boss", role = "admin")
            ids["old"] = LocalSupabase.insertMovie(mapOf("genres" to listOf(genre), "published_at" to "2026-01-01T00:00:00Z"))
            ids["new"] = LocalSupabase.insertMovie(mapOf("genres" to listOf(genre, "otro"), "published_at" to "2026-06-01T00:00:00Z"))
            ids["plain"] = LocalSupabase.insertMovie(mapOf("genres" to emptyList<String>()))
            ids["finished"] = LocalSupabase.insertMovie(emptyMap())
            ids["draft"] = LocalSupabase.insertMovie(mapOf("status" to "draft", "genres" to listOf(genre)))
        }

        @AfterClass @JvmStatic fun cleanup() = runBlocking<Unit> {
            LocalSupabase.deleteMovies(ids.values)
            LocalSupabase.deleteUsers(viewer.id, boss.id)
        }
    }

    private suspend fun catalogAs(user: LocalSupabase.TestUser, genre: String? = null): Catalog {
        val client = createMavrosSupabase(LocalSupabase.config, MemorySessionManager())
        LocalSupabase.signIn(client, user)
        val auth = SupabaseAuthRepository(client, CoroutineScope(SupervisorJob() + Dispatchers.Default))
        return (SupabaseCatalogRepository(client, auth).catalog(genre) as DataResult.Success).value
    }

    private suspend fun repoAs(user: LocalSupabase.TestUser): SupabaseCatalogRepository {
        val client = createMavrosSupabase(LocalSupabase.config, MemorySessionManager())
        LocalSupabase.signIn(client, user)
        return SupabaseCatalogRepository(client, SupabaseAuthRepository(client, CoroutineScope(SupervisorJob() + Dispatchers.Default)))
    }

    private fun Catalog.indexOf(id: String) = recent.indexOfFirst { it.id == id }

    @Test fun `MOB-04 token caducado - catalogo y detalle llegan completos, sin error ni boveda vacia`() = runBlocking<Unit> {
        val client = createMavrosSupabase(LocalSupabase.config, MemorySessionManager())
        LocalSupabase.signIn(client, viewer)
        client.auth.importSession(client.auth.currentSessionOrNull()!!.withRejectedAccessToken(), autoRefresh = false)
        val repo = SupabaseCatalogRepository(client, SupabaseAuthRepository(client, CoroutineScope(SupervisorJob() + Dispatchers.Default)))

        val catalog = repo.catalog()
        assertIs<DataResult.Success<Catalog>>(catalog, "el usuario no debe ver un error por un token caducado")
        assertTrue(catalog.value.indexOf(ids["new"]!!) >= 0, "nunca la bóveda vacía")

        client.auth.importSession(client.auth.currentSessionOrNull()!!.withRejectedAccessToken(), autoRefresh = false)
        val detail = repo.movie(ids["new"]!!)
        assertIs<DataResult.Success<*>>(detail)
        assertNotNull(detail.value)
        assertNotNull(client.auth.currentSessionOrNull(), "la sesión sigue")
    }

    @Test fun `MOB-07 solo publicadas, tambien para un admin`() = runBlocking<Unit> {
        for (user in listOf(viewer, boss)) {
            val catalog = catalogAs(user)
            assertTrue(catalog.indexOf(ids["new"]!!) >= 0)
            assertEquals(-1, catalog.indexOf(ids["draft"]!!))
        }
    }

    @Test fun `MOB-07 la publicada mas recientemente va primero`() = runBlocking<Unit> {
        val catalog = catalogAs(viewer)
        assertTrue(catalog.indexOf(ids["new"]!!) < catalog.indexOf(ids["old"]!!))
    }

    @Test fun `MOB-07 generos de las publicadas y filtro`() = runBlocking<Unit> {
        assertTrue(genre in catalogAs(viewer).genres)
        val filtered = catalogAs(viewer, genre)
        assertTrue(filtered.recent.all { genre in it.genres })
        assertEquals(setOf(ids["new"], ids["old"]), filtered.recent.map { it.id }.toSet())
        assertEquals(emptyList(), catalogAs(viewer, "no-existe-$tag").recent)
    }

    @Test fun `MOB-07 seguir viendo - entre 5 y 95 por ciento, el mas reciente primero, solo lo propio`() = runBlocking<Unit> {
        val watcher = LocalSupabase.createUser("and-watcher")
        LocalSupabase.setProgress(watcher.id, ids["old"]!!, 500.0) // 50 %
        Thread.sleep(20)
        LocalSupabase.setProgress(watcher.id, ids["finished"]!!, 960.0) // 96 % terminada
        Thread.sleep(20)
        LocalSupabase.setProgress(watcher.id, ids["new"]!!, 100.0) // 10 %

        val mine = catalogAs(watcher).continueWatching
        assertEquals(listOf(ids["new"], ids["old"]), mine.map { it.movie.id })
        assertEquals(100.0, mine.first().positionSeconds)

        assertTrue(catalogAs(viewer).continueWatching.none { it.movie.id == ids["old"] })
        LocalSupabase.deleteUsers(watcher.id)
    }

    @Test fun `MOB-08 detalle de una publicada con el progreso del usuario`() = runBlocking<Unit> {
        val watcher = LocalSupabase.createUser("and-detail")
        LocalSupabase.setProgress(watcher.id, ids["old"]!!, 321.5)
        val detail = (repoAs(watcher).movie(ids["old"]!!) as DataResult.Success).value
        assertNotNull(detail)
        assertEquals(ids["old"], detail.movie.id)
        assertEquals(321.5, detail.positionSeconds)

        val noProgress = (repoAs(viewer).movie(ids["old"]!!) as DataResult.Success).value
        assertNull(noProgress!!.positionSeconds)
        LocalSupabase.deleteUsers(watcher.id)
    }

    @Test fun `MOB-08 borrador o id inexistente para un user - no disponible`() = runBlocking<Unit> {
        val repo = repoAs(viewer)
        assertNull((repo.movie(ids["draft"]!!) as DataResult.Success).value)
        assertNull((repo.movie(UUID.randomUUID().toString()) as DataResult.Success).value)
    }

    @Test fun `MOB-09 sin red - Failure Network, no excepcion`() = runBlocking<Unit> {
        val offline = com.mavros.archiver.core.data.MavrosConfig("http://127.0.0.1:9", LocalSupabase.anonKey, "http://localhost")
        val client = createMavrosSupabase(offline, MemorySessionManager())
        val repo = SupabaseCatalogRepository(client, SupabaseAuthRepository(client, CoroutineScope(SupervisorJob() + Dispatchers.Default)))
        val result = repo.catalog()
        assertIs<DataResult.Failure>(result)
        assertEquals(com.mavros.archiver.core.data.DataError.Network, result.error)
    }
}
