package com.mavros.archiver.tv

import android.view.KeyEvent
import androidx.compose.ui.graphics.asAndroidBitmap
import com.google.zxing.BinaryBitmap
import com.google.zxing.RGBLuminanceSource
import com.google.zxing.common.HybridBinarizer
import com.google.zxing.qrcode.QRCodeReader
import com.mavros.archiver.core.data.AuthRepository
import com.mavros.archiver.core.data.DataError
import com.mavros.archiver.core.data.DataResult
import com.mavros.archiver.core.data.DeviceAuthRepository
import com.mavros.archiver.core.data.DeviceCode
import com.mavros.archiver.core.data.DevicePoll
import com.mavros.archiver.core.data.DeviceTokens
import com.mavros.archiver.core.data.LoginError
import com.mavros.archiver.core.data.SessionState
import com.mavros.archiver.core.model.Catalog
import com.mavros.archiver.core.model.CatalogSeries
import com.mavros.archiver.core.model.Series
import com.mavros.archiver.core.model.ContinueItem
import com.mavros.archiver.core.model.Movie
import com.mavros.archiver.tv.catalog.tvRows
import com.mavros.archiver.tv.login.CodeNotice
import com.mavros.archiver.tv.login.TvLoginState
import com.mavros.archiver.tv.login.TvLoginViewModel
import com.mavros.archiver.tv.login.qrBitmap
import com.mavros.archiver.tv.player.TvPlayerAction
import com.mavros.archiver.tv.player.tvPlayerAction
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestCoroutineScheduler
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.GraphicsMode
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull
import kotlin.test.assertTrue

fun movie(id: String, title: String = "Película $id", genres: List<String> = emptyList(), duration: Int = 6000) =
    Movie(id = id, slug = "slug-$id", title = title, durationSeconds = duration, genres = genres, releaseYear = 2025)

private fun code(n: Int) = DeviceCode("dc-$n", "ABCD-EFG$n", "https://mavros.test/link", "https://mavros.test/link?code=ABCD-EFG$n", 600, 5)

/** Dispositivo falso: entrega códigos en orden y responde el sondeo con lo que diga [polls] */
private class FakeDevice(val polls: ArrayDeque<DataResult<DevicePoll>> = ArrayDeque()) : DeviceAuthRepository {
    var codes = 0
    /** Errores a devolver al pedir código, en orden */
    val codeErrors = ArrayDeque<DataError>()
    val requestedAt = mutableListOf<Long>()
    val polledAt = mutableListOf<Long>()
    var clock: () -> Long = { 0 }
    override suspend fun requestCode(clientName: String): DataResult<DeviceCode> {
        requestedAt += clock()
        codeErrors.removeFirstOrNull()?.let { return DataResult.Failure(it) }
        return DataResult.Success(code(++codes))
    }
    override suspend fun poll(deviceCode: String): DataResult<DevicePoll> {
        polledAt += clock()
        return polls.removeFirstOrNull() ?: DataResult.Success(DevicePoll.Pending)
    }
}

private class FakeAuth(var accept: Boolean = true) : AuthRepository {
    val imported = mutableListOf<DeviceTokens>()
    override val session = MutableStateFlow<SessionState>(SessionState.SignedOut)
    override suspend fun signIn(email: String, password: String): LoginError? = null
    override suspend fun signOut() {}
    override suspend fun validateSession() = true
    override suspend fun onUnauthorized() {}
    override suspend fun signInWithTokens(tokens: DeviceTokens): Boolean { imported += tokens; return accept }
}

/** TV-01 / TV-02 / TV-03 con reloj virtual */
@OptIn(ExperimentalCoroutinesApi::class)
class TvLoginViewModelTest {
    private val scheduler = TestCoroutineScheduler()
    @Before fun setUp() = Dispatchers.setMain(StandardTestDispatcher(scheduler))
    @After fun tearDown() = Dispatchers.resetMain()

    private fun vm(device: FakeDevice, auth: FakeAuth = FakeAuth()): TvLoginViewModel {
        device.clock = { scheduler.currentTime }
        return TvLoginViewModel(device, auth, "Hisense TV")
    }

    @Test fun `muestra el codigo y sondea cada interval segundos`() {
        val device = FakeDevice()
        val vm = vm(device)
        scheduler.advanceTimeBy(1); scheduler.runCurrent()
        assertEquals(TvLoginState.Showing(code(1)), vm.state.value)
        scheduler.advanceTimeBy(15_001)
        assertEquals(listOf(5_000L, 10_000L, 15_000L), device.polledAt.map { it - 1 + 1 })
    }

    @Test fun `slow_down suma 5 s al intervalo y se queda asi`() {
        val device = FakeDevice(ArrayDeque(listOf(DataResult.Success(DevicePoll.SlowDown))))
        vm(device)
        scheduler.advanceTimeBy(30_001)
        // 5 s → slow_down → cada 10 s: 15, 25
        assertEquals(listOf(5_000L, 15_000L, 25_000L), device.polledAt)
    }

    @Test fun `aprobado - guarda la sesion recibida y termina`() {
        val tokens = DeviceTokens("a", "r", 1)
        val device = FakeDevice(ArrayDeque(listOf(DataResult.Success(DevicePoll.Pending), DataResult.Success(DevicePoll.Approved(tokens)))))
        val auth = FakeAuth()
        val vm = vm(device, auth)
        scheduler.advanceTimeBy(60_000)
        assertEquals(TvLoginState.SignedIn, vm.state.value)
        assertEquals(listOf(tokens), auth.imported)
        assertEquals(2, device.polledAt.size, "deja de sondear al entrar")
    }

    @Test fun `rechazado o caducado - codigo nuevo con aviso`() {
        for ((poll, notice) in listOf(DevicePoll.Denied to CodeNotice.Denied, DevicePoll.Expired to CodeNotice.Expired, DevicePoll.Invalid to CodeNotice.Expired)) {
            val device = FakeDevice(ArrayDeque(listOf(DataResult.Success(poll))))
            val vm = vm(device)
            scheduler.advanceTimeBy(5_001); scheduler.runCurrent()
            assertEquals(TvLoginState.Showing(code(2), notice), vm.state.value, "$poll")
        }
    }

    @Test fun `aprobado pero la sesion no sirve - codigo nuevo con aviso`() {
        val device = FakeDevice(ArrayDeque(listOf(DataResult.Success(DevicePoll.Approved(DeviceTokens("a", "r", 1))))))
        val vm = vm(device, FakeAuth(accept = false))
        scheduler.advanceTimeBy(5_001); scheduler.runCurrent()
        assertEquals(TvLoginState.Showing(code(2), CodeNotice.Failed), vm.state.value)
    }

    @Test fun `sin red al pedir codigo - dice Sin conexion y reintenta solo`() {
        val device = FakeDevice().apply { codeErrors += DataError.Network }
        val vm = vm(device)
        scheduler.advanceTimeBy(1); scheduler.runCurrent()
        assertEquals(TvLoginState.Unavailable(DataError.Network), vm.state.value)
        scheduler.advanceTimeBy(TvLoginViewModel.RETRY_MS); scheduler.runCurrent()
        assertEquals(TvLoginState.Showing(code(1)), vm.state.value)
    }

    @Test fun `TV-03 el servidor rechaza (p ej demasiados intentos) - dice la causa real, no Sin conexion`() {
        val device = FakeDevice().apply { codeErrors += DataError.Server }
        val vm = vm(device)
        scheduler.advanceTimeBy(1); scheduler.runCurrent()
        assertEquals(TvLoginState.Unavailable(DataError.Server), vm.state.value)
    }

    @Test fun `TV-03 reintenta cada vez mas espaciado - 5, 10, 20, 40 s y luego cada 60 s`() {
        val device = FakeDevice().apply { repeat(6) { codeErrors += DataError.Server } }
        vm(device)
        scheduler.advanceTimeBy(5 * 60_000L); scheduler.runCurrent()
        val gaps = device.requestedAt.zipWithNext { a, b -> b - a }
        assertEquals(listOf(5_000L, 10_000L, 20_000L, 40_000L, 60_000L, 60_000L), gaps.take(6))
    }

    @Test fun `TV-03 tras conseguir codigo, el siguiente fallo vuelve a empezar en 5 s`() {
        val device = FakeDevice(ArrayDeque(listOf(DataResult.Success(DevicePoll.Expired)))).apply {
            codeErrors += DataError.Server; codeErrors += DataError.Server
        }
        vm(device)
        scheduler.advanceTimeBy(60_000); scheduler.runCurrent()
        // falla (5 s) → falla (10 s) → código → caduca a los 5 s → pide otro de inmediato y lo obtiene
        assertEquals(listOf(5_000L, 10_000L, 5_000L), device.requestedAt.zipWithNext { a, b -> b - a }.take(3))
    }

    @Test fun `sin red al sondear - conserva el codigo, avisa y sigue`() {
        val device = FakeDevice(ArrayDeque(listOf(DataResult.Failure(DataError.Network), DataResult.Success(DevicePoll.Pending))))
        val vm = vm(device)
        scheduler.advanceTimeBy(5_001); scheduler.runCurrent()
        assertEquals(TvLoginState.Showing(code(1), offline = true), vm.state.value)
        scheduler.advanceTimeBy(5_000); scheduler.runCurrent()
        assertEquals(TvLoginState.Showing(code(1)), vm.state.value)
    }
}

class TvRowsTest {
    @Test fun `TV-04 filas - seguir viendo, recien agregadas y una por genero, sin filas vacias`() {
        val a = movie("a", genres = listOf("anime")); val b = movie("b", genres = listOf("acción", "anime")); val c = movie("c")
        val rows = tvRows(Catalog(genres = listOf("acción", "anime", "terror"), recent = listOf(a, b, c), continueWatching = listOf(ContinueItem(b, 3000.0))))
        assertEquals(listOf("Seguir viendo", "Recién agregadas", "Acción", "Anime"), rows.map { it.title })
        assertEquals(listOf("b"), rows[0].items.map { it.id })
        assertEquals(0.5f, rows[0].items[0].progress)
        assertEquals(listOf("a", "b"), rows[3].items.map { it.id })
        assertTrue(tvRows(Catalog(emptyList(), emptyList(), emptyList())).isEmpty())
    }

    @Test fun `SER-15 fila Series despues de recien agregadas, series en su genero y episodio en seguir viendo`() {
        val a = movie("a", genres = listOf("drama"))
        val show = Series(id = "s", slug = "s", title = "Breaking Bad", releaseYear = 2008, genres = listOf("drama"))
        val ep = Movie(id = "e2", slug = "e2", title = "El gato", durationSeconds = 1000, seriesId = "s", seasonNumber = 1, episodeNumber = 2)
        val rows = tvRows(
            Catalog(
                genres = listOf("drama"),
                recent = listOf(a),
                continueWatching = listOf(ContinueItem(ep, 0.0, show)),
                series = listOf(CatalogSeries(show, 2, 10)),
            ),
        )
        assertEquals(listOf("Seguir viendo", "Recién agregadas", "Series", "Drama"), rows.map { it.title })
        // El episodio abre el episodio pero se ve con el póster y título de su serie
        val continueItem = rows[0].items.single()
        assertEquals("e2", continueItem.id)
        assertEquals("Breaking Bad", continueItem.title)
        assertEquals("T1:E2 · El gato", continueItem.meta)
        assertEquals(false, continueItem.isSeries)
        val seriesItem = rows[2].items.single()
        assertEquals("s", seriesItem.id)
        assertEquals("2008 · 2 temporadas", seriesItem.meta)
        assertTrue(seriesItem.isSeries)
        assertEquals(listOf("a", "s"), rows[3].items.map { it.id })
        // Solo series: no hay "Recién agregadas" vacía
        assertEquals(listOf("Series", "Drama"), tvRows(Catalog(listOf("drama"), emptyList(), emptyList(), listOf(CatalogSeries(show, 1, 1)))).map { it.title })
    }
}

class TvPlayerKeysTest {
    private val hidden = false
    private val visible = true

    @Test fun `TV-06 controles ocultos - OK los muestra, flechas laterales adelantan o atrasan`() {
        assertEquals(TvPlayerAction.ShowControls, tvPlayerAction(KeyEvent.KEYCODE_DPAD_CENTER, hidden))
        assertEquals(TvPlayerAction.ShowControls, tvPlayerAction(KeyEvent.KEYCODE_ENTER, hidden))
        assertEquals(TvPlayerAction.ShowControls, tvPlayerAction(KeyEvent.KEYCODE_DPAD_UP, hidden))
        assertEquals(TvPlayerAction.SeekBack, tvPlayerAction(KeyEvent.KEYCODE_DPAD_LEFT, hidden))
        assertEquals(TvPlayerAction.SeekForward, tvPlayerAction(KeyEvent.KEYCODE_DPAD_RIGHT, hidden))
        assertEquals(TvPlayerAction.Exit, tvPlayerAction(KeyEvent.KEYCODE_BACK, hidden))
    }

    @Test fun `TV-06 controles visibles - flechas y OK van a los botones, nunca pausan solos`() {
        for (key in listOf(KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_DPAD_RIGHT, KeyEvent.KEYCODE_DPAD_UP, KeyEvent.KEYCODE_DPAD_DOWN)) {
            assertEquals(TvPlayerAction.ToControls, tvPlayerAction(key, visible), "tecla $key")
        }
        assertEquals(TvPlayerAction.HideControls, tvPlayerAction(KeyEvent.KEYCODE_BACK, visible))
    }

    @Test fun `TV-06 teclas multimedia actuan siempre`() {
        for (shown in listOf(hidden, visible)) {
            assertEquals(TvPlayerAction.TogglePlay, tvPlayerAction(KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, shown))
            assertEquals(TvPlayerAction.SeekBack, tvPlayerAction(KeyEvent.KEYCODE_MEDIA_REWIND, shown))
            assertEquals(TvPlayerAction.SeekForward, tvPlayerAction(KeyEvent.KEYCODE_MEDIA_FAST_FORWARD, shown))
            assertEquals(TvPlayerAction.Exit, tvPlayerAction(KeyEvent.KEYCODE_MEDIA_STOP, shown))
        }
        assertNull(tvPlayerAction(KeyEvent.KEYCODE_VOLUME_UP, hidden), "el volumen lo maneja el sistema")
    }
}

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@org.robolectric.annotation.Config(sdk = [35])
class QrTest {
    @Test fun `TV-01 el QR contiene exactamente la URL con el codigo`() {
        val url = "https://the-mavros-archiver.vercel.app/link?code=ABCD-EFGH"
        val bmp = qrBitmap(url).asAndroidBitmap()
        val pixels = IntArray(bmp.width * bmp.height).also { bmp.getPixels(it, 0, bmp.width, 0, 0, bmp.width, bmp.height) }
        val decoded = QRCodeReader().decode(BinaryBitmap(HybridBinarizer(RGBLuminanceSource(bmp.width, bmp.height, pixels))))
        assertEquals(url, decoded.text)
    }
}
