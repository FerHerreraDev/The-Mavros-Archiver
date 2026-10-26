package com.mavros.archiver.mobile

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.mavros.archiver.core.data.DataError
import com.mavros.archiver.core.data.DataResult
import com.mavros.archiver.core.data.PlaybackSource
import com.mavros.archiver.core.design.MavrosTheme
import com.mavros.archiver.core.model.MovieDetail
import com.mavros.archiver.mobile.detail.DetailUiState
import com.mavros.archiver.mobile.detail.DetailViewModel
import com.mavros.archiver.mobile.player.PlayerScreen
import com.mavros.archiver.mobile.player.PlayerUiState
import com.mavros.archiver.mobile.player.PlayerViewModel
import com.mavros.archiver.mobile.player.qualityLabels
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

/** MOB-13 / MOB-14 / MOB-19 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
class PlayerTest {
    @get:Rule val compose = createComposeRule()
    @Before fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())
    @After fun tearDown() = Dispatchers.resetMain()

    private val source = PlaybackSource("https://cdn.test/t/T/movies/x/master.m3u8", 123L)

    // ---- ViewModel ----

    @Test fun `MOB-13 pide la URL de esa pelicula y queda lista`() {
        val repo = FakePlaybackRepository(DataResult.Success(source))
        val vm = PlayerViewModel(repo, "m1")
        assertEquals(PlayerUiState.Ready(source), vm.state.value)
        assertEquals(1, repo.calls)
    }

    @Test fun `MOB-13 no disponible y error con reintento`() {
        assertEquals(PlayerUiState.NotAvailable, PlayerViewModel(FakePlaybackRepository(DataResult.Success(null)), "m1").state.value)

        val repo = FakePlaybackRepository(DataResult.Failure(DataError.Network))
        val vm = PlayerViewModel(repo, "m1")
        assertEquals(PlayerUiState.Error(DataError.Network), vm.state.value)
        repo.result = DataResult.Success(source)
        vm.retry()
        assertEquals(PlayerUiState.Ready(source), vm.state.value)
    }

    @Test fun `MOB-14 opciones de calidad - automatica y resoluciones de mayor a menor sin repetir`() {
        assertEquals(
            listOf(null to "Automática", 1080 to "1080p", 720 to "720p", 480 to "480p"),
            qualityLabels(listOf(480, 1080, 720, 720, 0)),
        )
        assertEquals(listOf<Pair<Int?, String>>(null to "Automática"), qualityLabels(emptyList()))
    }

    @Test fun `MOB-19 refrescar el detalle trae el progreso nuevo sin skeleton y si falla no borra`() {
        val repo = FakeCatalogRepository()
        repo.detailResult = DataResult.Success(MovieDetail(movie("1"), null))
        val vm = DetailViewModel(repo, "1")
        repo.detailResult = DataResult.Success(MovieDetail(movie("1"), 754.0))
        vm.refresh()
        assertEquals(754.0, assertIs<DetailUiState.Content>(vm.state.value).detail.positionSeconds)

        repo.detailResult = DataResult.Failure(DataError.Network)
        vm.refresh()
        assertIs<DetailUiState.Content>(vm.state.value)
    }

    @Test fun `MOB-19 el detalle se actualiza cuando el reproductor termina de guardar, aunque guarde despues de volver`() {
        val repo = FakeCatalogRepository()
        repo.detailResult = DataResult.Success(MovieDetail(movie("1"), null))
        val progress = FakeProgressRepository()
        val vm = DetailViewModel(repo, "1", progress)
        // El detalle ya volvió a mostrarse; el guardado de salida llega después
        repo.detailResult = DataResult.Success(MovieDetail(movie("1"), 36.0))
        kotlinx.coroutines.runBlocking { progress.save("1", 36.0) }
        assertEquals(36.0, assertIs<DetailUiState.Content>(vm.state.value).detail.positionSeconds)
    }

    @Test fun `MOB-19 guardar el progreso de otra pelicula no recarga este detalle`() {
        val repo = FakeCatalogRepository()
        val progress = FakeProgressRepository()
        DetailViewModel(repo, "1", progress)
        val before = repo.detailCalls
        kotlinx.coroutines.runBlocking { progress.save("2", 50.0) }
        assertEquals(before, repo.detailCalls)
    }

    @Test fun `MOB-19 el catalogo se recarga al guardar progreso (Seguir viendo)`() {
        val repo = FakeCatalogRepository()
        val progress = FakeProgressRepository()
        com.mavros.archiver.mobile.catalog.CatalogViewModel(repo, progress)
        val before = repo.requestedGenres.size
        kotlinx.coroutines.runBlocking { progress.save("3", 3100.0) }
        assertEquals(before + 1, repo.requestedGenres.size)
    }

    // ---- Pantalla ----

    private fun screen(
        state: PlayerUiState,
        inPip: Boolean = false,
        controls: Boolean = true,
        buffering: Boolean = false,
        failed: Boolean = false,
        qualities: List<Pair<Int?, String>> = qualityLabels(listOf(1080, 720)),
        onRetry: () -> Unit = {},
        onQuality: (Int?) -> Unit = {},
    ) = compose.setContent {
        MavrosTheme {
            PlayerScreen(state, "Chainsaw Man", inPip, controls, buffering, failed, qualities, null, onQuality, {}, onRetry) {
                Box(Modifier.fillMaxSize().testTag("video")) // como PlayerView: ocupa la pantalla
            }
        }
    }

    @Test fun `MOB-13 mientras prepara se ve el loader, con titulo y volver`() {
        screen(PlayerUiState.Loading)
        compose.onNodeWithTag("player-loading").assertIsDisplayed()
        compose.onNodeWithText("Chainsaw Man").assertIsDisplayed()
        compose.onNodeWithContentDescription("Volver").assertIsDisplayed()
    }

    @Test fun `MOB-13 error con Reintentar`() {
        var retried = 0
        screen(PlayerUiState.Error(DataError.Network), onRetry = { retried++ })
        compose.onNodeWithText("Sin conexión. Revisa tu internet.").assertIsDisplayed()
        compose.onNodeWithText("Reintentar").performClick()
        assertEquals(1, retried)
    }

    @Test fun `MOB-13 no disponible - mensaje sin reintentar`() {
        screen(PlayerUiState.NotAvailable)
        compose.onNodeWithText("Esta película no está disponible.").assertIsDisplayed()
        compose.onNodeWithText("Reintentar").assertDoesNotExist()
    }

    @Test fun `MOB-13 si el video falla al reproducir - mensaje y reintentar`() {
        var retried = 0
        screen(PlayerUiState.Ready(source), failed = true, onRetry = { retried++ })
        compose.onNodeWithText("Reintentar").performClick()
        assertEquals(1, retried)
    }

    @Test fun `MOB-14 listo - video, loader al cargar y selector de calidad`() {
        var picked: Int? = -1
        screen(PlayerUiState.Ready(source), buffering = true, onQuality = { picked = it })
        compose.onNodeWithTag("video").assertIsDisplayed()
        compose.onNodeWithTag("player-loading").assertIsDisplayed()
        compose.onNodeWithTag("quality").performClick()
        compose.onNodeWithTag("quality-720p").performClick()
        assertEquals(720, picked)
    }

    @Test fun `MOB-14 con una sola calidad no hay selector`() {
        screen(PlayerUiState.Ready(source), qualities = qualityLabels(listOf(720)).take(1))
        compose.onNodeWithTag("quality").assertDoesNotExist()
    }

    @Test fun `MOB-17 en PiP solo el video - sin barra ni loader`() {
        screen(PlayerUiState.Ready(source), inPip = true, buffering = true)
        compose.onNodeWithTag("video").assertIsDisplayed()
        compose.onNodeWithText("Chainsaw Man").assertDoesNotExist()
        compose.onNodeWithTag("player-loading").assertDoesNotExist()
    }

    @Test fun `MOB-14 la barra se oculta con los controles`() {
        screen(PlayerUiState.Ready(source), controls = false)
        compose.onNodeWithText("Chainsaw Man").assertDoesNotExist()
    }
}
