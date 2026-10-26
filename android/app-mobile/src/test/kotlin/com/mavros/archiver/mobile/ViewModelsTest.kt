package com.mavros.archiver.mobile

import com.mavros.archiver.core.data.DataError
import com.mavros.archiver.core.data.DataResult
import com.mavros.archiver.core.data.LoginError
import com.mavros.archiver.core.model.MovieDetail
import com.mavros.archiver.core.android.catalog.CatalogUiState
import com.mavros.archiver.core.android.catalog.CatalogViewModel
import com.mavros.archiver.core.android.detail.DetailUiState
import com.mavros.archiver.core.android.detail.DetailViewModel
import com.mavros.archiver.core.android.detail.playLabel
import com.mavros.archiver.mobile.login.INVALID_CREDENTIALS_MESSAGE
import com.mavros.archiver.mobile.login.LoginViewModel
import com.mavros.archiver.mobile.login.NETWORK_MESSAGE
import com.mavros.archiver.core.data.CatalogRepository
import com.mavros.archiver.core.model.Catalog
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.launch
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class ViewModelsTest {
    @Before fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())
    @After fun tearDown() = Dispatchers.resetMain()

    // ---- Login (MOB-03) ----

    @Test fun `MOB-03 el boton solo se habilita con email y contrasena`() {
        val vm = LoginViewModel(FakeAuthRepository())
        assertFalse(vm.state.value.canSubmit)
        vm.onEmail("a@b.co")
        assertFalse(vm.state.value.canSubmit)
        vm.onPassword("x")
        assertTrue(vm.state.value.canSubmit)
    }

    @Test fun `MOB-03 datos invalidos no llegan al servidor`() {
        val auth = FakeAuthRepository()
        val vm = LoginViewModel(auth)
        vm.onEmail("no-es-email"); vm.onPassword("corta"); vm.submit()
        assertNotNull(vm.state.value.emailError)
        assertNotNull(vm.state.value.passwordError)
        assertTrue(auth.signInCalls.isEmpty())
    }

    @Test fun `MOB-03 credenciales malas - mensaje generico`() {
        val auth = FakeAuthRepository().apply { nextSignInError = LoginError.InvalidCredentials }
        val vm = LoginViewModel(auth)
        vm.onEmail("a@b.co"); vm.onPassword("12345678"); vm.submit()
        assertEquals(INVALID_CREDENTIALS_MESSAGE, vm.state.value.error)
        assertFalse(vm.state.value.loading)
    }

    @Test fun `MOB-03 sin red - mensaje de conexion`() {
        val auth = FakeAuthRepository().apply { nextSignInError = LoginError.Network }
        val vm = LoginViewModel(auth)
        vm.onEmail("a@b.co"); vm.onPassword("12345678"); vm.submit()
        assertEquals(NETWORK_MESSAGE, vm.state.value.error)
    }

    @Test fun `MOB-03 escribir de nuevo borra el error`() {
        val auth = FakeAuthRepository().apply { nextSignInError = LoginError.InvalidCredentials }
        val vm = LoginViewModel(auth)
        vm.onEmail("a@b.co"); vm.onPassword("12345678"); vm.submit()
        vm.onPassword("123456789")
        assertNull(vm.state.value.error)
    }

    @Test fun `MOB-03 login correcto llama al repositorio con los datos escritos`() {
        val auth = FakeAuthRepository()
        val vm = LoginViewModel(auth)
        vm.onEmail("a@b.co"); vm.onPassword("12345678"); vm.submit()
        assertEquals(listOf("a@b.co" to "12345678"), auth.signInCalls)
        assertNull(vm.state.value.error)
    }

    // ---- Catálogo (MOB-07, MOB-09) ----

    @Test fun `MOB-07 carga el catalogo`() {
        val vm = CatalogViewModel(FakeCatalogRepository())
        val state = assertIs<CatalogUiState.Content>(vm.state.value)
        assertEquals(2, state.catalog.recent.size)
    }

    @Test fun `MOB-07 elegir genero pide ese genero y lo recuerda`() {
        val repo = FakeCatalogRepository()
        val vm = CatalogViewModel(repo)
        vm.selectGenre("anime")
        assertEquals("anime", repo.requestedGenres.last())
        assertEquals("anime", assertIs<CatalogUiState.Content>(vm.state.value).genre)
        vm.selectGenre(null)
        assertNull(repo.requestedGenres.last())
    }

    @Test fun `MOB-09 error y luego reintentar con exito`() {
        val repo = FakeCatalogRepository()
        val ok = repo.catalogResult
        repo.catalogResult = DataResult.Failure(DataError.Network)
        val vm = CatalogViewModel(repo)
        assertEquals(DataError.Network, assertIs<CatalogUiState.Error>(vm.state.value).error)
        repo.catalogResult = ok
        vm.retry()
        assertIs<CatalogUiState.Content>(vm.state.value)
    }

    @Test fun `MOB-12 al abrir, el refresco que cancela la primera carga nunca muestra error`() {
        // Un repositorio que, al ser cancelado, devuelve un error (como si se tragara la cancelación)
        val repo = object : CatalogRepository {
            var calls = 0
            override suspend fun catalog(genre: String?): DataResult<Catalog> {
                calls++
                if (calls == 1) {
                    try {
                        awaitCancellation()
                    } catch (e: CancellationException) {
                        return DataResult.Failure(DataError.Server)
                    }
                }
                return FakeCatalogRepository().catalogResult
            }
            override suspend fun movie(id: String): DataResult<MovieDetail?> = DataResult.Success(null)
        }
        val vm = CatalogViewModel(repo)
        val seen = mutableListOf<CatalogUiState>()
        val collector = CoroutineScope(Dispatchers.Unconfined).launch { vm.state.collect { seen += it } }

        vm.refresh() // LifecycleResumeEffect al mostrarse la pantalla
        collector.cancel()
        assertTrue(seen.none { it is CatalogUiState.Error }, "estados vistos: $seen")
        assertIs<CatalogUiState.Content>(vm.state.value)
    }

    @Test fun `MOB-09 un refresco fallido no borra lo que ya se ve`() {
        val repo = FakeCatalogRepository()
        val vm = CatalogViewModel(repo)
        repo.catalogResult = DataResult.Failure(DataError.Network)
        vm.refresh()
        assertIs<CatalogUiState.Content>(vm.state.value)
    }

    // ---- Detalle (MOB-08) ----

    @Test fun `MOB-08 detalle disponible, no disponible y error`() {
        val repo = FakeCatalogRepository()
        assertIs<DetailUiState.Content>(DetailViewModel(repo, "1").state.value)

        repo.detailResult = DataResult.Success(null)
        assertIs<DetailUiState.NotAvailable>(DetailViewModel(repo, "x").state.value)

        repo.detailResult = DataResult.Failure(DataError.Server)
        assertEquals(DataError.Server, assertIs<DetailUiState.Error>(DetailViewModel(repo, "1").state.value).error)
    }

    @Test fun `MOB-08 texto del boton segun el progreso (reglas PRG-02)`() {
        assertEquals("Reproducir", playLabel(MovieDetail(movie("1", duration = 6000), null)))
        assertEquals("Reproducir", playLabel(MovieDetail(movie("1", duration = 6000), 5.0)))
        assertEquals("Continuar desde 12:34", playLabel(MovieDetail(movie("1", duration = 6000), 754.0)))
        assertEquals("Reproducir", playLabel(MovieDetail(movie("1", duration = 6000), 5800.0)))
    }
}
