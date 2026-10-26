package com.mavros.archiver.tv

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
}
