package com.mavros.archiver.tv

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performKeyInput
import androidx.compose.ui.test.requestFocus
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.pressKey
import com.mavros.archiver.core.android.catalog.CatalogUiState
import com.mavros.archiver.core.android.detail.DetailUiState
import com.mavros.archiver.core.data.DeviceCode
import com.mavros.archiver.core.model.Catalog
import com.mavros.archiver.core.model.MovieDetail
import com.mavros.archiver.tv.catalog.TvCatalogScreen
import com.mavros.archiver.tv.detail.TvDetailScreen
import com.mavros.archiver.tv.login.CodeNotice
import com.mavros.archiver.tv.login.TvLoginScreen
import com.mavros.archiver.tv.login.TvLoginState
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import kotlin.test.assertEquals

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w960dp-h540dp-television-xhdpi")
@OptIn(ExperimentalTestApi::class)
class TvScreensTest {
    @get:Rule val compose = createComposeRule()
    private fun content(block: @androidx.compose.runtime.Composable () -> Unit) = compose.setContent { MavrosTvTheme { block() } }

    private val code = DeviceCode("dc", "ABCD-EFGH", "https://the-mavros-archiver.vercel.app/link", "https://the-mavros-archiver.vercel.app/link?code=ABCD-EFGH", 600, 5)

    @Test fun `TV-01 muestra el codigo, la direccion y el QR`() {
        content { TvLoginScreen(TvLoginState.Showing(code)) }
        compose.onNodeWithTag("tv-code").assertTextContains("ABCD-EFGH")
        compose.onNodeWithText("the-mavros-archiver.vercel.app/link", substring = true).assertIsDisplayed()
        compose.onNodeWithTag("tv-qr").assertIsDisplayed()
    }

    @Test fun `TV-03 avisa por que hay un codigo nuevo y si no hay red`() {
        content { TvLoginScreen(TvLoginState.Showing(code, CodeNotice.Expired, offline = true)) }
        compose.onNodeWithTag("tv-notice").assertTextContains("caducó", substring = true)
        compose.onNodeWithTag("tv-offline").assertIsDisplayed()
    }

    @Test fun `TV-03 sin red dice Sin conexion y si el servidor falla lo dice distinto`() {
        var state by mutableStateOf<TvLoginState>(TvLoginState.Unavailable(com.mavros.archiver.core.data.DataError.Network))
        content { TvLoginScreen(state) }
        compose.onNodeWithText("Sin conexión", substring = true).assertIsDisplayed()
        state = TvLoginState.Unavailable(com.mavros.archiver.core.data.DataError.Server)
        compose.waitForIdle()
        compose.onNodeWithText("No se pudo pedir un código", substring = true).assertIsDisplayed()
        compose.onNodeWithText("Sin conexión", substring = true).assertDoesNotExist()
    }

    private val catalog = Catalog(
        genres = listOf("anime"),
        recent = listOf(movie("1", "Akira", listOf("anime")), movie("2", "Perfect Blue", listOf("anime")), movie("3", "Paprika")),
        continueWatching = emptyList(),
    )

    @Test fun `TV-04 al abrir el foco esta en la primera pelicula y la flecha derecha avanza`() {
        var opened: String? = null
        content { TvCatalogScreen(CatalogUiState.Content(catalog, null), onOpenMovie = { opened = it }, onSignOut = {}, onRetry = {}) }
        compose.waitForIdle()
        // Akira está en dos filas (Recién agregadas y Anime): la primera es la de arriba
        compose.onAllNodesWithTag("tv-card-1")[0].assertIsFocused()
        compose.onRoot().performKeyInput { pressKey(Key.DirectionRight) }
        compose.onAllNodesWithTag("tv-card-2")[0].assertIsFocused()
        compose.onRoot().performKeyInput { pressKey(Key.DirectionCenter) }
        compose.waitForIdle()
        assertEquals("2", opened)
    }

    @Test fun `TV-04 filas visibles y skeleton al cargar`() {
        content { TvCatalogScreen(CatalogUiState.Content(catalog, null), {}, {}, {}) }
        compose.onNodeWithText("Recién agregadas").assertIsDisplayed()
        compose.onNodeWithText("Anime").assertIsDisplayed()
    }

    @Test fun `TV-04 cargando muestra el skeleton despues de 200 ms`() {
        compose.mainClock.autoAdvance = false
        content { TvCatalogScreen(CatalogUiState.Loading, {}, {}, {}) }
        compose.mainClock.advanceTimeBy(600)
        compose.onNodeWithTag("skeleton").assertIsDisplayed()
    }

    @Test fun `TV-05 detalle - boton Continuar desde enfocado al abrir`() {
        var played: Pair<String, Double>? = null
        content { TvDetailScreen(DetailUiState.Content(MovieDetail(movie("1", "Akira"), 754.0)), onPlay = { m, s -> played = m.id to s }, onRetry = {}) }
        compose.waitForIdle()
        compose.onNodeWithTag("tv-play").assertIsFocused().assertTextContains("Continuar desde 12:34")
        compose.onRoot().performKeyInput { pressKey(Key.DirectionCenter) }
        compose.waitForIdle()
        assertEquals("1" to 754.0, played)
    }

    @Test fun `TV-07 se puede cerrar sesion`() {
        var signedOut = 0
        content { TvCatalogScreen(CatalogUiState.Content(catalog, null), {}, onSignOut = { signedOut++ }, {}) }
        compose.onNodeWithTag("tv-sign-out").assertIsDisplayed()
        compose.onRoot().performKeyInput { pressKey(Key.DirectionUp) }
        compose.onNodeWithTag("tv-sign-out").assertIsFocused()
        compose.onRoot().performKeyInput { pressKey(Key.DirectionCenter) }
        compose.waitForIdle()
        assertEquals(1, signedOut)
    }

    // --- Series (SER-15, SER-16) ---------------------------------------------

    private val show = com.mavros.archiver.core.model.Series(id = "s", slug = "s", title = "Breaking Bad", releaseYear = 2008)
    private fun ep(id: String, season: Int, n: Int, title: String) =
        com.mavros.archiver.core.model.Movie(id = id, slug = id, title = title, durationSeconds = 1000, seriesId = "s", seasonNumber = season, episodeNumber = n)
    private val episodes = listOf(ep("e1", 1, 1, "Piloto"), ep("e2", 1, 2, "El gato"), ep("e3", 2, 1, "Siete"))

    @Test fun `SER-15 serie - el boton de que sigue queda enfocado y abajo estan los episodios de la temporada`() {
        val progress = listOf(com.mavros.archiver.core.model.EpisodeProgress("e1", 990.0, "2026-01-01T00:00:00Z"))
        val detail = com.mavros.archiver.core.model.SeriesDetail(show, episodes, mapOf("e1" to 990.0), com.mavros.archiver.core.model.SeriesRules.nextUp(episodes, progress))
        var played: Pair<String, Double>? = null
        var season by mutableStateOf<Int?>(1)
        content {
            com.mavros.archiver.tv.series.TvSeriesScreen(
                com.mavros.archiver.core.android.series.SeriesUiState.Content(detail, season),
                onPlay = { m, s -> played = m.id to s },
                onSelectSeason = { season = it },
                onRetry = {},
            )
        }
        compose.waitForIdle()
        compose.onNodeWithTag("tv-play").assertIsFocused().assertTextContains("Reproducir T1:E2")
        compose.onRoot().performKeyInput { pressKey(Key.DirectionCenter) }
        assertEquals("e2" to 0.0, played)
        compose.onNodeWithTag("tv-episode-e1").assertIsDisplayed()
        compose.onNodeWithTag("tv-episode-e3").assertDoesNotExist()
        compose.onNodeWithTag("tv-season-2").assertIsDisplayed()
    }

    @Test fun `SER-16 siguiente episodio - Ver ahora enfocado, OK lo reproduce`() {
        var played: String? = null
        var cancelled = 0
        content { com.mavros.archiver.tv.player.TvNextEpisode(com.mavros.archiver.core.android.player.UpNext(episodes[1], 0.0, inList = false), { played = it.movie.id }, { cancelled++ }) }
        compose.waitForIdle()
        compose.onNodeWithTag("tv-next-countdown").assertTextContains("Siguiente episodio en", substring = true)
        compose.onNodeWithText("T1:E2 · El gato").assertIsDisplayed()
        compose.onNodeWithTag("tv-next-now").assertIsFocused()
        compose.onRoot().performKeyInput { pressKey(Key.DirectionCenter) }
        assertEquals("e2", played)
    }

    @Test fun `SER-12 detalle de un episodio muestra su serie`() {
        content { TvDetailScreen(DetailUiState.Content(MovieDetail(episodes[1], null, show)), onPlay = { _, _ -> }, onRetry = {}) }
        compose.onNodeWithTag("tv-series-line").assertTextContains("Breaking Bad · T1:E2")
    }

    // --- Listas (PL-07) ----------------------------------------------------------

    @Test fun `PL-07 mis listas - la primera enfocada y OK la abre`() {
        var opened: String? = null
        val lists = listOf(com.mavros.archiver.core.model.PlaylistSummary(com.mavros.archiver.core.model.Playlist("l1", "Finde"), 2), com.mavros.archiver.core.model.PlaylistSummary(com.mavros.archiver.core.model.Playlist("l2", "Terror"), 0))
        content { com.mavros.archiver.tv.lists.TvListsScreen(com.mavros.archiver.core.android.lists.ListsUiState.Content(lists), { opened = it }, {}) }
        compose.waitForIdle()
        compose.onNodeWithTag("tv-list-l1").assertIsFocused()
        compose.onNodeWithText("2 elementos").assertIsDisplayed()
        compose.onRoot().performKeyInput { pressKey(Key.DirectionDown) }
        compose.onRoot().performKeyInput { pressKey(Key.DirectionCenter) }
        assertEquals("l2", opened)
    }

    @Test fun `PL-07 una lista - Reproducir lista enfocado, abajo los elementos`() {
        val detail = com.mavros.archiver.core.model.PlaylistDetail(
            com.mavros.archiver.core.model.Playlist("l1", "Maratón"),
            listOf(com.mavros.archiver.core.model.PlaylistItem("i1", 1, movie("m1", "Akira"), null), com.mavros.archiver.core.model.PlaylistItem("i2", 2, null, show)),
            com.mavros.archiver.core.model.ListPick(movie("m1", "Akira"), 0.0),
        )
        var played: String? = null
        var openedItem: String? = null
        content {
            com.mavros.archiver.tv.lists.TvPlaylistScreen(com.mavros.archiver.core.android.lists.PlaylistUiState.Content(detail), { played = it.start?.episode?.id }, { openedItem = it.id }, {})
        }
        compose.waitForIdle()
        compose.onNodeWithTag("tv-play-list").assertIsFocused()
        compose.onRoot().performKeyInput { pressKey(Key.DirectionCenter) }
        assertEquals("m1", played)
        compose.onNodeWithTag("tv-item-i2").assertTextContains("Serie", substring = true)
        compose.onRoot().performKeyInput { pressKey(Key.DirectionDown); pressKey(Key.DirectionDown) }
        compose.onRoot().performKeyInput { pressKey(Key.DirectionCenter) }
        assertEquals("i2", openedItem)
    }

    @Test fun `PL-07 agregar a lista en la tele - abre con mis listas marcadas y OK cambia`() {
        val toggled = mutableListOf<String>()
        val state = com.mavros.archiver.core.android.lists.AddToListState(
            lists = listOf(
                com.mavros.archiver.core.model.PlaylistMembership(com.mavros.archiver.core.model.Playlist("l1", "Finde"), true),
                com.mavros.archiver.core.model.PlaylistMembership(com.mavros.archiver.core.model.Playlist("l2", "Terror"), false),
            ),
        )
        content { com.mavros.archiver.tv.lists.TvAddToList(state, onOpen = {}, onToggle = { toggled += it }) }
        // Con el control: enfocar el botón y OK
        compose.onNodeWithTag("tv-add-to-list").requestFocus().performKeyInput { pressKey(Key.DirectionCenter) }
        compose.waitForIdle()
        // El diálogo es otra ventana (otra raíz): las teclas se mandan ahí
        val first = compose.onNodeWithTag("tv-toggle-l1")
        first.assertIsFocused()
        compose.onNodeWithContentDescription("En la lista").assertIsDisplayed()
        first.performKeyInput { pressKey(Key.DirectionDown) }
        compose.waitForIdle()
        compose.onNodeWithTag("tv-toggle-l2").assertIsFocused().performKeyInput { pressKey(Key.DirectionCenter) }
        assertEquals(listOf("l2"), toggled)
    }
}
