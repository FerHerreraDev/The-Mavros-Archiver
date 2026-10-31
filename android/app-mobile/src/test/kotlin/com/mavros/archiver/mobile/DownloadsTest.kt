package com.mavros.archiver.mobile

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.mavros.archiver.core.android.download.DownloadStartException
import com.mavros.archiver.core.android.download.OfflineDownloads
import com.mavros.archiver.core.android.download.OfflineItem
import com.mavros.archiver.core.android.download.OfflineMovie
import com.mavros.archiver.core.android.download.OfflineState
import com.mavros.archiver.core.data.DataError
import com.mavros.archiver.core.data.DataResult
import com.mavros.archiver.core.data.SessionState
import com.mavros.archiver.core.design.MavrosTheme
import com.mavros.archiver.core.model.MovieDetail
import kotlinx.coroutines.flow.MutableStateFlow
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import kotlin.test.assertEquals

class FakeDownloads : OfflineDownloads {
    override val items = MutableStateFlow<Map<String, OfflineItem>>(emptyMap())
    val started = mutableListOf<OfflineMovie>()
    val removed = mutableListOf<String>()
    var failWith: DataError? = null
    var fail = false
    override suspend fun start(movie: OfflineMovie) {
        if (fail) throw DownloadStartException(failWith)
        started += movie
        items.value = items.value + (movie.id to OfflineItem(movie, OfflineState.Downloading, 0.25f))
    }
    override fun remove(movieId: String) { removed += movieId; items.value = items.value - movieId }
}

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
// Android 12: sin el permiso de notificaciones de Android 13 de por medio
@Config(sdk = [31])
class DownloadsTest {
    @get:Rule val compose = createComposeRule()

    private fun signedIn() = FakeContainer(auth = FakeAuthRepository(SessionState.SignedIn("u", "u@test")))

    private fun openDetail(container: FakeContainer, downloads: FakeDownloads) {
        container.catalog.detailResult = DataResult.Success(MovieDetail(movie("1", "Akira", duration = 7200), null))
        compose.setContent { MavrosTheme { MavrosNavHost(container, downloads) } }
        compose.onNodeWithText("Akira").performClick()
    }

    @Test fun `DL-01 Descargar en el detalle muestra el avance y se puede cancelar`() {
        val downloads = FakeDownloads()
        openDetail(signedIn(), downloads)
        compose.onNodeWithTag("download").assertTextContains("Descargar").performClick()
        compose.onNodeWithTag("download-progress").assertIsDisplayed()
        compose.onNodeWithText("Descargando… 25 %").assertIsDisplayed()
        assertEquals(listOf("1"), downloads.started.map { it.id })
        assertEquals("Akira", downloads.started.single().title)
        compose.onNodeWithContentDescription("Cancelar descarga").performClick()
        assertEquals(listOf("1"), downloads.removed)
        compose.onNodeWithTag("download").assertIsDisplayed()
    }

    @Test fun `DL-01 sin conexion no empieza y lo explica`() {
        val downloads = FakeDownloads().apply { fail = true; failWith = DataError.Network }
        openDetail(signedIn(), downloads)
        compose.onNodeWithTag("download").performClick()
        compose.onNodeWithTag("download-error").assertTextContains("Sin conexión", substring = true)
    }

    @Test fun `DL-03 lista de descargas desde el catalogo, terminada se reproduce y se borra`() {
        val downloads = FakeDownloads()
        val done = OfflineMovie("9", "Hokum", 6000, subtitle = null)
        downloads.items.value = mapOf("9" to OfflineItem(done, OfflineState.Completed, 1f, 1_500_000_000))
        compose.setContent { MavrosTheme { MavrosNavHost(signedIn(), downloads) } }
        compose.onNodeWithTag("open-downloads").assertTextContains("1 descarga").performClick()
        compose.onNodeWithTag("download-status-9", useUnmergedTree = true).assertTextContains("1.5 GB", substring = true)
        compose.onNodeWithContentDescription("Borrar Hokum").performClick()
        assertEquals(listOf("9"), downloads.removed)
        compose.onNodeWithTag("downloads-empty").assertIsDisplayed()
    }

    @Test fun `DL-03 sin internet el error del catalogo lleva a las descargas`() {
        val container = signedIn()
        container.catalog.catalogResult = DataResult.Failure(DataError.Network)
        compose.setContent { MavrosTheme { MavrosNavHost(container, FakeDownloads()) } }
        compose.onNodeWithTag("error-downloads").performClick()
        compose.onNodeWithTag("downloads-empty").assertIsDisplayed()
    }
}
