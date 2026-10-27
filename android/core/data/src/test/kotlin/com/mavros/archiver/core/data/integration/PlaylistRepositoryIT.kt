package com.mavros.archiver.core.data.integration

import com.mavros.archiver.core.data.DataResult
import com.mavros.archiver.core.data.SupabaseAuthRepository
import com.mavros.archiver.core.data.SupabasePlaylistRepository
import com.mavros.archiver.core.data.createMavrosSupabase
import com.mavros.archiver.core.model.PlaylistTarget
import io.github.jan.supabase.auth.MemorySessionManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.runBlocking
import org.junit.AfterClass
import org.junit.BeforeClass
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** PL-07 desde Android contra Supabase local: mismas reglas (RLS y "qué sigue") que la web */
class PlaylistRepositoryIT {
    companion object {
        private lateinit var ana: LocalSupabase.TestUser
        private lateinit var beto: LocalSupabase.TestUser
        private lateinit var show: String
        private val ids = mutableMapOf<String, String>()

        @BeforeClass @JvmStatic fun setup() = runBlocking<Unit> {
            ana = LocalSupabase.createUser("and-pl-ana")
            beto = LocalSupabase.createUser("and-pl-beto")
            ids["m1"] = LocalSupabase.insertMovie(mapOf("title" to "Uno"))
            ids["m2"] = LocalSupabase.insertMovie(mapOf("title" to "Dos"))
            ids["draft"] = LocalSupabase.insertMovie(mapOf("status" to "draft"))
            show = LocalSupabase.insertSeries()
            ids["e1"] = LocalSupabase.insertMovie(mapOf("series_id" to show, "season_number" to 1, "episode_number" to 1))
            ids["e2"] = LocalSupabase.insertMovie(mapOf("series_id" to show, "season_number" to 1, "episode_number" to 2))
        }

        @AfterClass @JvmStatic fun cleanup() = runBlocking<Unit> {
            LocalSupabase.deleteSeries(listOf(show))
            LocalSupabase.deleteMovies(ids.values)
            LocalSupabase.deleteUsers(ana.id, beto.id)
        }
    }

    private suspend fun repoAs(user: LocalSupabase.TestUser): SupabasePlaylistRepository {
        val client = createMavrosSupabase(LocalSupabase.config, MemorySessionManager())
        LocalSupabase.signIn(client, user)
        return SupabasePlaylistRepository(client, SupabaseAuthRepository(client, CoroutineScope(SupervisorJob() + Dispatchers.Default)))
    }

    private fun <T> DataResult<T>.ok(): T = (this as DataResult.Success).value

    @Test fun `PL-07 crear con algo, marcar, agregar y quitar`() = runBlocking<Unit> {
        val repo = repoAs(ana)
        val id = repo.create("  Finde  ", PlaylistTarget.MovieTarget(ids["m1"]!!)).ok()
        val summary = repo.lists().ok().first { it.playlist.id == id }
        assertEquals("Finde", summary.playlist.name)
        assertEquals(1, summary.count)

        assertTrue(repo.membership(PlaylistTarget.MovieTarget(ids["m1"]!!)).ok().first { it.playlist.id == id }.contains)
        assertEquals(true, repo.toggle(id, PlaylistTarget.SeriesTarget(show)).ok())
        assertEquals(false, repo.toggle(id, PlaylistTarget.MovieTarget(ids["m1"]!!)).ok())
        assertEquals(listOf(show), repo.playlist(id).ok()!!.items.map { it.series?.id })
        // Un borrador no se puede agregar
        assertIs<DataResult.Failure>(repo.toggle(id, PlaylistTarget.MovieTarget(ids["draft"]!!)))
    }

    @Test fun `PL-07 reproducir lista y lo que sigue, como la web`() = runBlocking<Unit> {
        val repo = repoAs(ana)
        val id = repo.create("Maratón", PlaylistTarget.MovieTarget(ids["m1"]!!)).ok()
        repo.toggle(id, PlaylistTarget.SeriesTarget(show))
        repo.toggle(id, PlaylistTarget.MovieTarget(ids["m2"]!!))

        val detail = repo.playlist(id).ok()!!
        assertEquals(listOf(ids["m1"], show, ids["m2"]), detail.items.map { it.movie?.id ?: it.series?.id })
        assertEquals(ids["m1"], detail.start?.episode?.id)
        assertEquals(ids["e1"], repo.next(id, ids["m1"]!!).ok()?.episode?.id)
        assertEquals(ids["e2"], repo.next(id, ids["e1"]!!).ok()?.episode?.id)
        assertEquals(ids["m2"], repo.next(id, ids["e2"]!!).ok()?.episode?.id)
        assertNull(repo.next(id, ids["m2"]!!).ok())
    }

    @Test fun `PL-07 la lista de otra persona no existe para mi`() = runBlocking<Unit> {
        val id = repoAs(ana).create("Privada", PlaylistTarget.MovieTarget(ids["m1"]!!)).ok()
        val beto = repoAs(beto)
        assertNull(beto.playlist(id).ok())
        assertTrue(beto.lists().ok().none { it.playlist.id == id })
        assertIs<DataResult.Failure>(beto.toggle(id, PlaylistTarget.MovieTarget(ids["m2"]!!)))
        assertNull(beto.next(id, ids["m1"]!!).ok())
    }
}
