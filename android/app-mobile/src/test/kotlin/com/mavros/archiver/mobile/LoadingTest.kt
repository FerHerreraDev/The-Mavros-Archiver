package com.mavros.archiver.mobile

import android.provider.Settings
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.height
import androidx.compose.ui.unit.width
import androidx.test.core.app.ApplicationProvider
import coil3.ColorImage
import coil3.ImageLoader
import coil3.SingletonImageLoader
import coil3.annotation.DelicateCoilApi
import coil3.request.ErrorResult
import coil3.test.FakeImageLoaderEngine
import com.mavros.archiver.core.design.MavrosTheme
import com.mavros.archiver.core.design.ShimmerAnimatedKey
import com.mavros.archiver.core.model.Catalog
import com.mavros.archiver.core.model.MovieDetail
import com.mavros.archiver.mobile.catalog.CatalogContent
import com.mavros.archiver.mobile.catalog.CatalogUiState
import com.mavros.archiver.mobile.detail.DetailContent
import com.mavros.archiver.mobile.detail.DetailUiState
import com.mavros.archiver.mobile.ui.PosterCard
import com.mavros.archiver.mobile.ui.thumbhashBitmap
import kotlinx.coroutines.awaitCancellation
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import kotlin.math.abs
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

// ThumbHash del póster de prueba rojo arriba / azul abajo, generado por la librería de la web
// (tests/fixtures/thumbhash/cases.json, caso "poster-red-blue-png")
private const val RED_BLUE = "17YCpSB4eI+IeIdYd4iYeIiPiPh4"
private const val OK = "https://posters.test/ok.png"
private const val FAIL = "https://posters.test/fail.png"
private const val PENDING = "https://posters.test/pending.png"

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w412dp-h915dp-xxhdpi")
@OptIn(DelicateCoilApi::class)
class LoadingTest {
    @get:Rule val compose = createComposeRule()
    private val context = ApplicationProvider.getApplicationContext<android.content.Context>()

    @Before fun fakeImages() {
        val engine = FakeImageLoaderEngine.Builder()
            .intercept(OK, ColorImage(0xFFFF0000.toInt(), width = 200, height = 300))
            .intercept({ it == FAIL }) { chain -> ErrorResult(null, chain.request, IllegalStateException("404")) }
            .intercept({ it == PENDING }) { awaitCancellation() }
            .build()
        SingletonImageLoader.setUnsafe(ImageLoader.Builder(context).components { add(engine) }.build())
    }

    @After fun reset() {
        SingletonImageLoader.reset()
        Settings.Global.putFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f)
    }

    private fun content(block: @Composable () -> Unit) = compose.setContent { MavrosTheme { block() } }
    private fun catalogLoading() = content { CatalogContent(CatalogUiState.Loading, {}, {}, {}, {}) }.also { pastDelay() }

    /** El skeleton aparece a los 200 ms (LOAD-01): se avanza el reloj de Compose para verlo */
    private fun pastDelay() {
        compose.mainClock.advanceTimeBy(600)
        compose.waitForIdle()
    }

    // ---------------------------------------------------------------- LOAD-01

    @Test fun `LOAD-01 catalogo - nada los primeros 200 ms, luego el skeleton`() {
        compose.mainClock.autoAdvance = false
        content { CatalogContent(CatalogUiState.Loading, {}, {}, {}, {}) }
        compose.mainClock.advanceTimeBy(150)
        compose.onNodeWithTag("loading").assertExists()
        compose.onNodeWithTag("skeleton").assertDoesNotExist()

        compose.mainClock.advanceTimeBy(400)
        compose.onNodeWithTag("skeleton").assertIsDisplayed()
    }

    @Test fun `LOAD-01 datos en menos de 200 ms - el skeleton nunca aparece`() {
        compose.mainClock.autoAdvance = false
        var state by mutableStateOf<CatalogUiState>(CatalogUiState.Loading)
        content { CatalogContent(state, {}, {}, {}, {}) }
        // advanceTimeBy redondea a cuadros de 16 ms: se avanza cuadro a cuadro hasta justo antes de 200 ms
        val start = compose.mainClock.currentTime
        var everShown = false
        while (compose.mainClock.currentTime - start < 180) {
            compose.mainClock.advanceTimeByFrame()
            everShown = everShown || compose.onAllNodesWithTag("skeleton").fetchSemanticsNodes().isNotEmpty()
        }
        state = CatalogUiState.Content(Catalog(emptyList(), listOf(movie("1")), emptyList()), null)
        compose.mainClock.advanceTimeBy(1000)
        assertTrue(!everShown, "el skeleton se vio antes de 200 ms")
        compose.onNodeWithTag("skeleton").assertDoesNotExist()
        compose.onNodeWithTag("catalog").assertExists()
    }

    @Test fun `LOAD-01 catalogo - posteres 2-3 con titulo y linea de meta, se anuncia como cargando`() {
        catalogLoading()
        compose.onNodeWithTag("skeleton").assert(SemanticsMatcher.expectValue(SemanticsProperties.ContentDescription, listOf("Cargando catálogo")))
        val posters = compose.onAllNodesWithTag("skeleton-poster", useUnmergedTree = true).fetchSemanticsNodes()
        assertTrue(posters.size >= 6, "pósters visibles: ${posters.size}")
        for (p in posters) {
            val ratio = p.size.height.toFloat() / p.size.width
            assertEquals(1.5f, ratio, 0.02f)
        }
    }

    @Test fun `LOAD-01 el skeleton ocupa el lugar exacto de los posteres reales`() {
        var state by mutableStateOf<CatalogUiState>(CatalogUiState.Loading)
        content { CatalogContent(state, {}, {}, {}, {}) }
        pastDelay()
        val skeleton = compose.onAllNodesWithTag("skeleton-poster", useUnmergedTree = true).onFirst().getUnclippedBoundsInRoot()

        state = CatalogUiState.Content(Catalog(listOf("anime", "acción"), (1..6).map { movie("$it") }, emptyList()), null)
        compose.waitForIdle()
        val real = compose.onNodeWithTag("poster-1", useUnmergedTree = true).getUnclippedBoundsInRoot()

        assertEquals(real.left.value, skeleton.left.value, 0.5f, "misma columna")
        assertEquals(real.width.value, skeleton.width.value, 0.5f, "mismo ancho")
        // Título de sección y chips pueden medir un poco distinto que sus bloques: ±8 dp
        assertTrue(abs((real.top - skeleton.top).value) <= 8f, "mismo alto en pantalla: real ${real.top} vs skeleton ${skeleton.top}")
    }

    @Test fun `LOAD-01 el brillo se anima por defecto`() {
        catalogLoading()
        compose.onNodeWithTag("skeleton").assert(SemanticsMatcher.expectValue(ShimmerAnimatedKey, true))
    }

    @Test fun `LOAD-01 con Quitar animaciones el skeleton no se anima pero se ve`() {
        Settings.Global.putFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 0f)
        catalogLoading()
        compose.onNodeWithTag("skeleton").assertIsDisplayed().assert(SemanticsMatcher.expectValue(ShimmerAnimatedKey, false))
    }

    @Test fun `LOAD-01 detalle - skeleton con poster de 140 dp, no un spinner`() {
        content { DetailContent(DetailUiState.Loading, {}, {}, {}) }
        pastDelay()
        compose.onNodeWithTag("skeleton").assertIsDisplayed()
        val poster = compose.onNodeWithTag("skeleton-poster", useUnmergedTree = true).getUnclippedBoundsInRoot()
        assertEquals(140f, poster.width.value, 0.5f)
        assertEquals(210f, poster.height.value, 0.5f)
    }

    @Test fun `MOB-12 el skeleton no es el estado vacio ni un error`() {
        catalogLoading()
        compose.onNodeWithTag("skeleton").assertExists()
        compose.onNodeWithTag("empty").assertDoesNotExist()
        compose.onNodeWithTag("error").assertDoesNotExist()
        compose.onNodeWithText("La bóveda está vacía por ahora.").assertDoesNotExist()
    }

    // ---------------------------------------------------------------- LOAD-02

    private fun card(url: String?, hash: String?) = content {
        PosterCard(movie("1", "Akira").copy(posterUrl = url, posterThumbhash = hash), onClick = {}, modifier = Modifier.width(120.dp))
    }

    @Test fun `LOAD-02 mientras carga la imagen se ve la vista previa ThumbHash`() {
        card(PENDING, RED_BLUE)
        compose.onNodeWithTag("poster-placeholder-1", useUnmergedTree = true).assertIsDisplayed()
        compose.onNodeWithTag("poster-fallback-1", useUnmergedTree = true).assertDoesNotExist()
    }

    @Test fun `LOAD-02 la imagen real carga encima de la vista previa`() {
        card(OK, RED_BLUE)
        compose.onNodeWithTag("poster-image-1", useUnmergedTree = true).assertIsDisplayed()
        compose.onNodeWithTag("poster-fallback-1", useUnmergedTree = true).assertDoesNotExist()
    }

    @Test fun `LOAD-02 si la imagen falla queda la tarjeta con el titulo`() {
        card(FAIL, RED_BLUE)
        compose.waitUntil(2000) { compose.onAllNodesWithTag("poster-fallback-1", useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithTag("poster-placeholder-1", useUnmergedTree = true).assertDoesNotExist()
        compose.onNodeWithTag("poster-image-1", useUnmergedTree = true).assertDoesNotExist()
    }

    @Test fun `LOAD-02 sin ThumbHash - color de tarjeta, sin vista previa`() {
        card(PENDING, null)
        compose.onNodeWithTag("poster-placeholder-1", useUnmergedTree = true).assertDoesNotExist()
        compose.onNodeWithTag("poster-image-1", useUnmergedTree = true).assertExists()
    }

    @Test fun `LOAD-02 ThumbHash corrupto no rompe la tarjeta`() {
        card(PENDING, "%%%")
        compose.onNodeWithTag("poster-placeholder-1", useUnmergedTree = true).assertDoesNotExist()
        compose.onNodeWithTag("poster-image-1", useUnmergedTree = true).assertExists()
    }

    @Test fun `LOAD-02 la vista previa tiene los colores del poster`() {
        val bitmap = assertNotNull(thumbhashBitmap(RED_BLUE)).asAndroidBitmap()
        val top = bitmap.getPixel(bitmap.width / 2, (bitmap.height * 0.1).toInt())
        val bottom = bitmap.getPixel(bitmap.width / 2, (bitmap.height * 0.9).toInt())
        assertTrue(android.graphics.Color.red(top) > android.graphics.Color.blue(top) + 60, "arriba rojo")
        assertTrue(android.graphics.Color.blue(bottom) > android.graphics.Color.red(bottom) + 60, "abajo azul")
        // ThumbHash guarda la proporción solo aproximada (23×32 aquí): basta con que sea vertical
        assertTrue(bitmap.width < bitmap.height, "vertical: ${bitmap.width}x${bitmap.height}")
        assertNull(thumbhashBitmap(null))
    }
}

