package com.mavros.archiver.core.data.integration

import com.mavros.archiver.core.data.DataResult
import com.mavros.archiver.core.data.SupabaseAuthRepository
import com.mavros.archiver.core.data.SupabaseCatalogRepository
import com.mavros.archiver.core.data.SupabaseProgressRepository
import com.mavros.archiver.core.data.createMavrosSupabase
import com.mavros.archiver.core.model.MovieDetail
import io.github.jan.supabase.auth.MemorySessionManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import org.junit.AfterClass
import org.junit.BeforeClass
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

/** MOB-15 / PRG-01 / PRG-03 / PRG-05 contra Supabase local */
class ProgressRepositoryIT {
    companion object {
        private lateinit var viewer: LocalSupabase.TestUser
        private lateinit var other: LocalSupabase.TestUser
        private val movies = mutableListOf<String>()

        @BeforeClass @JvmStatic fun setup() = runBlocking<Unit> {
            viewer = LocalSupabase.createUser("and-prog")
            other = LocalSupabase.createUser("and-prog-other")
        }

        @AfterClass @JvmStatic fun cleanup() = runBlocking<Unit> {
            LocalSupabase.deleteMovies(movies)
            LocalSupabase.deleteUsers(viewer.id, other.id)
        }
    }

    private suspend fun session(user: LocalSupabase.TestUser): Pair<SupabaseProgressRepository, SupabaseCatalogRepository> {
        val client = createMavrosSupabase(LocalSupabase.config, MemorySessionManager())
        LocalSupabase.signIn(client, user)
        val auth = SupabaseAuthRepository(client, CoroutineScope(SupervisorJob() + Dispatchers.Default))
        return SupabaseProgressRepository(client) to SupabaseCatalogRepository(client, auth)
    }

    private suspend fun SupabaseCatalogRepository.position(id: String) =
        (assertIs<DataResult.Success<MovieDetail?>>(movie(id)).value)?.positionSeconds

    @Test fun `guarda, actualiza el mismo registro y se lee al volver`() = runBlocking<Unit> {
        val id = LocalSupabase.insertMovie(emptyMap()).also { movies += it }
        val (progress, catalog) = session(viewer)

        assertIs<DataResult.Success<Unit>>(progress.save(id, 33.33349))
        assertEquals(33.333, catalog.position(id), "milisegundos, como la web")

        assertIs<DataResult.Success<Unit>>(progress.save(id, 50.0))
        assertEquals(50.0, catalog.position(id), "un solo registro: se actualiza")
    }

    @Test fun `MOB-19 avisa cada guardado exitoso, no los fallidos`() = runBlocking<Unit> {
        val ok = LocalSupabase.insertMovie(emptyMap()).also { movies += it }
        val draft = LocalSupabase.insertMovie(mapOf("status" to "draft")).also { movies += it }
        val (progress, _) = session(viewer)
        val heard = mutableListOf<String>()
        val job = launch(kotlinx.coroutines.Dispatchers.Unconfined) { progress.saved.collect { heard += it } }
        progress.save(ok, 12.0)
        progress.save(draft, 12.0)
        job.cancel()
        assertEquals(listOf(ok), heard)
    }

    @Test fun `el progreso es de cada usuario`() = runBlocking<Unit> {
        val id = LocalSupabase.insertMovie(emptyMap()).also { movies += it }
        val (mine, _) = session(viewer)
        mine.save(id, 40.0)
        val (_, theirs) = session(other)
        assertEquals(null, theirs.position(id))
    }

    @Test fun `no se guarda progreso de un borrador que no puede ver`() = runBlocking<Unit> {
        val id = LocalSupabase.insertMovie(mapOf("status" to "draft")).also { movies += it }
        val (progress, _) = session(viewer)
        assertIs<DataResult.Failure>(progress.save(id, 20.0))
    }
}
