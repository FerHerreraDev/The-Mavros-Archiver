package com.mavros.archiver.core.data.integration

import com.mavros.archiver.core.data.DataResult
import com.mavros.archiver.core.data.SupabaseAuthRepository
import com.mavros.archiver.core.data.SupabaseCatalogRepository
import com.mavros.archiver.core.data.createMavrosSupabase
import com.mavros.archiver.core.model.NextUpAction
import io.github.jan.supabase.auth.MemorySessionManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.runBlocking
import org.junit.AfterClass
import org.junit.BeforeClass
import org.junit.Test
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** SER-08..SER-12 y SER-15 desde Android, contra Supabase local (mismas reglas que la web) */
class SeriesRepositoryIT {
    companion object {
        private val genre = "serie-and-${UUID.randomUUID().toString().take(6)}"
        private lateinit var viewer: LocalSupabase.TestUser
        private lateinit var boss: LocalSupabase.TestUser
        private lateinit var show: String
        private lateinit var empty: String
        private lateinit var hidden: String
        private val ep = mutableMapOf<String, String>()

        private suspend fun episode(series: String, season: Int, number: Int, status: String = "published") =
            LocalSupabase.insertMovie(mapOf("series_id" to series, "season_number" to season, "episode_number" to number, "status" to status, "title" to "Ep $season x $number"))

        @BeforeClass @JvmStatic fun setup() = runBlocking<Unit> {
            viewer = LocalSupabase.createUser("and-ser")
            boss = LocalSupabase.createUser("and-ser-boss", role = "admin")
            show = LocalSupabase.insertSeries(mapOf("genres" to listOf(genre)))
            empty = LocalSupabase.insertSeries()
            hidden = LocalSupabase.insertSeries(mapOf("status" to "draft"))
            ep["s1e1"] = episode(show, 1, 1)
            ep["s1e2"] = episode(show, 1, 2)
            ep["s1e3draft"] = episode(show, 1, 3, "draft")
            ep["s2e1"] = episode(show, 2, 1)
            ep["onlyDraft"] = episode(empty, 1, 1, "draft")
            ep["hidden"] = episode(hidden, 1, 1)
        }

        @AfterClass @JvmStatic fun cleanup() = runBlocking<Unit> {
            LocalSupabase.deleteSeries(listOf(show, empty, hidden))
            LocalSupabase.deleteUsers(viewer.id, boss.id)
        }
    }

    private suspend fun repoAs(user: LocalSupabase.TestUser): SupabaseCatalogRepository {
        val client = createMavrosSupabase(LocalSupabase.config, MemorySessionManager())
        LocalSupabase.signIn(client, user)
        return SupabaseCatalogRepository(client, SupabaseAuthRepository(client, CoroutineScope(SupervisorJob() + Dispatchers.Default)))
    }

    @Test fun `SER-08 episodios no salen sueltos y la serie sale con temporadas, tambien para un admin`() = runBlocking<Unit> {
        for (user in listOf(viewer, boss)) {
            val catalog = (repoAs(user).catalog() as DataResult.Success).value
            assertFalse(catalog.recent.any { it.id in ep.values })
            val found = catalog.series.firstOrNull { it.series.id == show }
            assertNotNull(found)
            assertEquals(2, found.seasons)
            assertEquals(3, found.episodes)
            assertFalse(catalog.series.any { it.series.id == empty || it.series.id == hidden })
        }
    }

    @Test fun `SER-08 el genero filtra series y sale en los chips`() = runBlocking<Unit> {
        val repo = repoAs(viewer)
        assertTrue(genre in (repo.catalog() as DataResult.Success).value.genres)
        assertEquals(listOf(show), (repo.catalog(genre) as DataResult.Success).value.series.map { it.series.id })
    }

    @Test fun `SER-09 la serie trae solo episodios publicados en orden, borrador o inexistente es null`() = runBlocking<Unit> {
        val repo = repoAs(viewer)
        val detail = (repo.series(show) as DataResult.Success).value
        assertNotNull(detail)
        assertEquals(listOf(ep["s1e1"], ep["s1e2"], ep["s2e1"]), detail.episodes.map { it.id })
        assertEquals(listOf(1, 2), detail.seasons)
        assertNull((repo.series(hidden) as DataResult.Success).value)
        assertNull((repo.series(UUID.randomUUID().toString()) as DataResult.Success).value)
    }

    @Test fun `SER-10 y SER-11 que sigue y seguir viendo con el progreso del usuario`() = runBlocking<Unit> {
        val watcher = LocalSupabase.createUser("and-ser-watch")
        try {
            val repo = repoAs(watcher)
            assertEquals(NextUpAction.Start, (repo.series(show) as DataResult.Success).value!!.next!!.action)

            LocalSupabase.setProgress(watcher.id, ep["s1e2"]!!, 990.0)
            val next = (repo.series(show) as DataResult.Success).value!!.next!!
            assertEquals(ep["s2e1"], next.episode.id)
            assertEquals(NextUpAction.Play, next.action)
            val entries = (repo.catalog() as DataResult.Success).value.continueWatching.filter { it.series?.id == show }
            assertEquals(1, entries.size)
            assertEquals(ep["s2e1"], entries[0].movie.id)
            assertEquals(0.0, entries[0].positionSeconds)

            LocalSupabase.setProgress(watcher.id, ep["s2e1"]!!, 400.0)
            val detail = (repo.series(show) as DataResult.Success).value!!
            assertEquals(NextUpAction.Continue, detail.next!!.action)
            assertEquals(400.0, detail.progress[ep["s2e1"]])
            val again = (repo.catalog() as DataResult.Success).value.continueWatching.filter { it.series?.id == show }
            assertEquals(listOf(ep["s2e1"]), again.map { it.movie.id })
        } finally {
            LocalSupabase.deleteUsers(watcher.id)
        }
    }

    @Test fun `SER-12 siguiente episodio publicado, ultimo o pelicula da null, el detalle trae la serie`() = runBlocking<Unit> {
        val repo = repoAs(viewer)
        assertEquals(ep["s2e1"], (repo.nextEpisode(ep["s1e2"]!!) as DataResult.Success).value?.id)
        assertNull((repo.nextEpisode(ep["s2e1"]!!) as DataResult.Success).value)
        val movie = LocalSupabase.insertMovie(emptyMap())
        try {
            assertNull((repo.nextEpisode(movie) as DataResult.Success).value)
        } finally {
            LocalSupabase.deleteMovies(listOf(movie))
        }
        assertEquals(show, (repo.movie(ep["s1e1"]!!) as DataResult.Success).value!!.series?.id)
        assertNull((repo.movie(ep["hidden"]!!) as DataResult.Success).value)
    }
}
