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
        content { com.mavros.archiver.tv.player.TvNextEpisode(episodes[1], { played = it.id }, { cancelled++ }) }
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
}
