package com.mavros.archiver.mobile

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import com.mavros.archiver.core.android.catalog.CatalogUiState
import com.mavros.archiver.core.android.player.PlayerUiState
import com.mavros.archiver.core.android.player.PlayerViewModel
import com.mavros.archiver.core.android.series.SeriesUiState
import com.mavros.archiver.core.android.series.SeriesViewModel
import com.mavros.archiver.core.data.DataResult
import com.mavros.archiver.core.design.MavrosTheme
import com.mavros.archiver.core.model.Catalog
import com.mavros.archiver.core.model.CatalogSeries
import com.mavros.archiver.core.model.ContinueItem
import com.mavros.archiver.core.model.EpisodeProgress
import com.mavros.archiver.core.model.Movie
import com.mavros.archiver.core.model.SeriesDetail
import com.mavros.archiver.core.model.SeriesRules
import com.mavros.archiver.mobile.catalog.CatalogContent
import com.mavros.archiver.mobile.player.NextEpisodeCard
import com.mavros.archiver.mobile.series.SeriesContent
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
import kotlin.test.assertIs
import kotlin.test.assertNull

private val show = series("s", "Breaking Bad")
private val s1e1 = episode("e1", 1, 1, "Piloto")
private val s1e2 = episode("e2", 1, 2, "El gato")
private val s2e1 = episode("e3", 2, 1, "Siete treinta y siete")

private fun detail(progress: List<EpisodeProgress> = emptyList()): SeriesDetail {
    val episodes = listOf(s1e1, s1e2, s2e1)
    return SeriesDetail(show, episodes, progress.associate { it.movieId to it.position }, SeriesRules.nextUp(episodes, progress))
}

@RunWith(RobolectricTestRunner::class)
class SeriesScreensTest {
    @get:Rule val compose = createComposeRule()

    private fun content(block: @androidx.compose.runtime.Composable () -> Unit) = compose.setContent { MavrosTheme { block() } }

    @Test fun `SER-08 SER-11 catalogo - seccion Series y episodio en seguir viendo con su serie`() {
        val catalog = Catalog(
            genres = emptyList(),
            recent = listOf(movie("1", "Akira")),
            continueWatching = listOf(ContinueItem(s1e2, 500.0, show)),
            series = listOf(CatalogSeries(show, 2, 3)),
        )
        var openedSeries: String? = null
        var openedMovie: String? = null
        content { CatalogContent(CatalogUiState.Content(catalog, null), { openedMovie = it }, {}, {}, {}, { openedSeries = it }) }

        // En "Seguir viendo" el episodio lleva el póster y título de la serie y "T1:E2 · título"
        compose.onNodeWithTag("meta-e2", useUnmergedTree = true).assertTextContains("T1:E2 · El gato")
        compose.onNodeWithTag("progress-e2", useUnmergedTree = true).assertIsDisplayed()
        compose.onNodeWithTag("poster-e2").performClick()
        assertEquals("e2", openedMovie)

        compose.onNodeWithTag("catalog").performScrollToNode(hasTestTag("poster-s"))
        compose.onNodeWithText("Series").assertIsDisplayed()
        compose.onNodeWithTag("meta-s", useUnmergedTree = true).assertTextContains("2008 · 2 temporadas")
        compose.onNodeWithTag("poster-s").performClick()
        assertEquals("s", openedSeries)
    }

    @Test fun `SER-08 sin peliculas pero con series no sale el estado vacio`() {
        val catalog = Catalog(emptyList(), emptyList(), emptyList(), listOf(CatalogSeries(show, 1, 1)))
        content { CatalogContent(CatalogUiState.Content(catalog, null), {}, {}, {}, {}, {}) }
        compose.onNodeWithTag("empty").assertDoesNotExist()
        compose.onNodeWithText("2008 · 1 episodio").assertIsDisplayed()
    }

    @Test fun `SER-09 SER-10 serie - boton que sigue, temporadas y episodios`() {
        var season by mutableStateOf<Int?>(1)
        var played: Pair<String, Double>? = null
        val d = detail(listOf(EpisodeProgress("e1", 400.0, "2026-01-01T00:00:00Z")))
        content { SeriesContent(SeriesUiState.Content(d, season), {}, { m, s -> played = m.id to s }, { season = it }, {}) }

        compose.onNodeWithTag("title").assertTextContains("Breaking Bad")
        compose.onNodeWithTag("play").assertTextContains("Continuar T1:E1 desde 6:40")
        compose.onNodeWithTag("progress-e1", useUnmergedTree = true).assertIsDisplayed()
        compose.onNodeWithTag("episode-e3").assertDoesNotExist()

        compose.onNodeWithTag("play").performClick()
        assertEquals("e1" to 400.0, played)

        compose.onNodeWithText("Temporada 2").performClick()
        assertEquals(2, season)
        compose.onNodeWithTag("series").performScrollToNode(hasTestTag("episode-e3"))
        compose.onNodeWithTag("episode-e3").performClick()
        assertEquals("e3" to 0.0, played)
    }

    @Test fun `SER-16 siguiente episodio - Ver ahora y Cancelar`() {
        var played: Movie? = null
        var cancelled = 0
        content { NextEpisodeCard(s1e2, { played = it }, { cancelled++ }) }
        compose.onNodeWithTag("next-countdown").assertTextContains("Siguiente episodio en 10 s")
        compose.onNodeWithText("T1:E2 · El gato").assertIsDisplayed()
        compose.onNodeWithTag("next-cancel").performClick()
        assertEquals(1, cancelled)
        compose.onNodeWithTag("next-now").performClick()
        assertEquals("e2", played?.id)
    }

    @Test fun `SER-16 siguiente episodio - a los 10 s se reproduce solo`() {
        var played: Movie? = null
        compose.mainClock.autoAdvance = false
        content { NextEpisodeCard(s1e2, { played = it }, {}) }
        // El conteo arranca en el primer cuadro (~16 ms)
        compose.mainClock.advanceTimeBy(5_100)
        compose.onNodeWithTag("next-countdown").assertTextContains("Siguiente episodio en 5 s")
        assertNull(played)
        compose.mainClock.advanceTimeBy(5_000)
        assertEquals("e2", played?.id)
    }
}

@OptIn(ExperimentalCoroutinesApi::class)
class SeriesViewModelsTest {
    @Before fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())
    @After fun tearDown() = Dispatchers.resetMain()

    @Test fun `SER-09 al abrir muestra la temporada del episodio que sigue y se puede cambiar`() {
        val repo = FakeCatalogRepository().apply { seriesResult = DataResult.Success(detail(listOf(EpisodeProgress("e2", 990.0, "2026-01-01T00:00:00Z")))) }
        val vm = SeriesViewModel(repo, "s")
        val content = assertIs<SeriesUiState.Content>(vm.state.value)
        assertEquals("e3", content.detail.next?.episode?.id)
        assertEquals(2, content.season)
        vm.selectSeason(1)
        assertEquals(1, (vm.state.value as SeriesUiState.Content).season)
        // Al refrescar (volver del reproductor) se queda en la temporada elegida
        vm.refresh()
        assertEquals(1, (vm.state.value as SeriesUiState.Content).season)
    }

    @Test fun `SER-09 serie que no se puede ver`() {
        val vm = SeriesViewModel(FakeCatalogRepository(), "x")
        assertEquals(SeriesUiState.NotAvailable, vm.state.value)
    }

    @Test fun `SER-16 el reproductor busca el siguiente episodio de lo que reproduce`() {
        val repo = FakeCatalogRepository().apply { nextResult = DataResult.Success(s1e2) }
        val vm = PlayerViewModel(FakePlaybackRepository(), "e1", repo)
        assertIs<PlayerUiState.Ready>(vm.state.value)
        assertEquals(listOf("e1"), repo.nextRequests)
        assertEquals("e2", vm.next.value?.id)
        // Sin catálogo (o película) no hay siguiente
        assertNull(PlayerViewModel(FakePlaybackRepository(), "m").next.value)
    }
}
