package com.mavros.archiver.mobile

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.isToggleable
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import com.mavros.archiver.core.android.lists.AddToListState
import com.mavros.archiver.core.android.lists.AddToListViewModel
import com.mavros.archiver.core.android.lists.ListsUiState
import com.mavros.archiver.core.android.lists.PlaylistUiState
import com.mavros.archiver.core.android.player.PlayerViewModel
import com.mavros.archiver.core.data.DataResult
import com.mavros.archiver.core.design.MavrosTheme
import com.mavros.archiver.core.model.ListPick
import com.mavros.archiver.core.model.Playlist
import com.mavros.archiver.core.model.PlaylistDetail
import com.mavros.archiver.core.model.PlaylistItem
import com.mavros.archiver.core.model.PlaylistMembership
import com.mavros.archiver.core.model.PlaylistSummary
import com.mavros.archiver.core.model.PlaylistTarget
import com.mavros.archiver.mobile.lists.AddToListBody
import com.mavros.archiver.mobile.lists.ListsContent
import com.mavros.archiver.mobile.lists.PlaylistContent
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import kotlin.test.assertEquals
import kotlin.test.assertNull

@RunWith(RobolectricTestRunner::class)
class ListsScreensTest {
    @get:Rule val compose = createComposeRule()
    private fun content(block: @androidx.compose.runtime.Composable () -> Unit) = compose.setContent { MavrosTheme { block() } }

    @Test fun `PL-07 mis listas - cada una con su cuenta y tocar abre`() {
        var opened: String? = null
        content { ListsContent(ListsUiState.Content(listOf(PlaylistSummary(Playlist("l1", "Finde"), 3))), {}, { opened = it }, {}) }
        compose.onNodeWithText("Finde").assertIsDisplayed()
        compose.onNodeWithText("3 elementos").assertIsDisplayed()
        compose.onNodeWithTag("list-l1").performClick()
        assertEquals("l1", opened)
    }

    @Test fun `PL-07 sin listas explica como agregar`() {
        content { ListsContent(ListsUiState.Content(emptyList()), {}, {}, {}) }
        compose.onNodeWithTag("lists-empty").assertIsDisplayed()
    }

    @Test fun `PL-07 una lista - reproducir lista y abrir cada elemento (pelicula o serie)`() {
        val show = series("s", "Breaking Bad")
        val detail = PlaylistDetail(
            Playlist("l1", "Maratón"),
            listOf(PlaylistItem("i1", 1, movie("m1", "Akira"), null), PlaylistItem("i2", 2, null, show)),
            ListPick(movie("m1", "Akira"), 120.0),
        )
        var played: PlaylistDetail? = null
        var openedItem: PlaylistItem? = null
        content { PlaylistContent(PlaylistUiState.Content(detail), {}, { played = it }, { openedItem = it }, {}) }
        compose.onNodeWithText("Maratón").assertIsDisplayed()
        compose.onNodeWithTag("item-i2").assertTextContains("SERIE", substring = true)
        compose.onNodeWithTag("play-list").performClick()
        assertEquals("m1", played?.start?.episode?.id)
        compose.onNodeWithTag("item-i2").performClick()
        assertEquals("s", openedItem?.series?.id)
    }

    @Test fun `PL-07 agregar a lista - marcadas, tocar cambia, crear nueva`() {
        val toggled = mutableListOf<String>()
        var created: String? = null
        val state = AddToListState(lists = listOf(PlaylistMembership(Playlist("l1", "Finde"), true), PlaylistMembership(Playlist("l2", "Clásicos"), false)))
        // El contenido del diálogo (Robolectric no deja inactivo un campo de texto dentro de un AlertDialog)
        content { AddToListBody(state, { toggled += it }, { created = it }) }
        compose.onNodeWithTag("toggle-l1").assertIsOn()
        compose.onNodeWithTag("toggle-l2").assertIsOff()
        compose.onNodeWithTag("toggle-l2").performClick()
        assertEquals(listOf("l2"), toggled)
        compose.onNodeWithTag("new-list-name").performTextInput("Terror")
        compose.onNodeWithTag("create-list").performClick()
        assertEquals("Terror", created)
    }
}

@OptIn(ExperimentalCoroutinesApi::class)
class ListsViewModelsTest {
    @Before fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())
    @After fun tearDown() = Dispatchers.resetMain()

    @Test fun `PL-07 agregar y quitar actualiza las marcas y crear agrega de una vez`() {
        val repo = FakePlaylistRepository()
        val vm = AddToListViewModel(repo, PlaylistTarget.MovieTarget("m1"))
        assertEquals(listOf(false, false), vm.state.value.lists!!.map { it.contains })

        vm.toggle("l1")
        assertEquals(listOf(true, false), vm.state.value.lists!!.map { it.contains })
        vm.toggle("l1")
        assertEquals(listOf(false, false), vm.state.value.lists!!.map { it.contains })

        vm.create("  Terror  ")
        val created = vm.state.value.lists!!.last()
        assertEquals("Terror", created.playlist.name)
        assertEquals(true, created.contains)
    }

    @Test fun `PL-07 nombre invalido y error de red se avisan y un segundo toque mientras guarda no repite (UX-01)`() {
        val repo = FakePlaylistRepository()
        val vm = AddToListViewModel(repo, PlaylistTarget.SeriesTarget("s"))
        vm.create("   ")
        assertEquals("Nombre de 1 a 100 caracteres.", vm.state.value.error)

        repo.gate = CompletableDeferred()
        vm.toggle("l1")
        assertEquals("l1", vm.state.value.busy)
        vm.toggle("l1")
        vm.toggle("l2")
        repo.gate!!.complete(Unit)
        assertEquals(1, repo.toggles.size)
        assertNull(vm.state.value.busy)

        repo.gate = null
        repo.failToggle = true
        vm.toggle("l2")
        assertEquals("No se pudo guardar. Intenta de nuevo.", vm.state.value.error)
    }

    @Test fun `PL-07 reproduciendo desde una lista el siguiente es el de la lista, no el episodio`() {
        val playlists = FakePlaylistRepository().apply { nextResult = DataResult.Success(ListPick(movie("m2"), 300.0)) }
        val catalog = FakeCatalogRepository().apply { nextResult = DataResult.Success(episode("e2", 1, 2)) }
        val vm = PlayerViewModel(FakePlaybackRepository(), "m1", catalog, playlists, listId = "l1")
        assertEquals(listOf("l1" to "m1"), playlists.nextRequests)
        assertEquals("m2", vm.next.value?.movie?.id)
        assertEquals(300.0, vm.next.value?.startAt)
        assertEquals("Siguiente en la lista", vm.next.value?.heading)
        assertEquals(emptyList(), catalog.nextRequests)

        // Sin lista: el siguiente episodio
        val plain = PlayerViewModel(FakePlaybackRepository(), "e1", catalog, playlists)
        assertEquals("e2", plain.next.value?.movie?.id)
        assertEquals("Siguiente episodio", plain.next.value?.heading)
    }
}
