package com.mavros.archiver.core.android.update

import com.mavros.archiver.core.data.AppUpdateRepository
import com.mavros.archiver.core.data.DataError
import com.mavros.archiver.core.data.DataResult
import com.mavros.archiver.core.model.AppRelease
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Test
import java.io.File
import java.io.IOException
import kotlin.test.assertEquals
import kotlin.test.assertIs

@OptIn(ExperimentalCoroutinesApi::class)
class UpdateViewModelTest {
    @Before fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())
    @After fun tearDown() = Dispatchers.resetMain()

    private val v7 = AppRelease(7, "1.3.0", "a".repeat(64), "https://s.test/7.apk")

    private class FakeRepo(var result: DataResult<AppRelease?>) : AppUpdateRepository {
        val asked = mutableListOf<String>()
        override suspend fun latest(app: String): DataResult<AppRelease?> { asked += app; return result }
    }

    private class FakeInstaller : ApkInstaller {
        var allowed = true
        var hasSettings = true
        var settingsOpened = 0
        var failure: Throwable? = null
        var gate: CompletableDeferred<Unit>? = null
        val installed = mutableListOf<File>()
        val progress = mutableListOf<Float?>()
        override val results = MutableSharedFlow<InstallResult>(extraBufferCapacity = 4)
        override suspend fun download(release: AppRelease, onProgress: (Float?) -> Unit): File {
            onProgress(0.5f)
            gate?.await()
            failure?.let { throw it }
            onProgress(1f)
            return File("${release.versionCode}.apk")
        }
        override fun canInstall() = allowed
        override fun openInstallSettings(): Boolean { settingsOpened++; return hasSettings }
        override fun install(apk: File) { installed += apk }
    }

    private fun vm(repo: FakeRepo, installer: FakeInstaller = FakeInstaller(), installed: Int = 6) =
        UpdateViewModel(repo, installer, "tv", installed)

    @Test fun `UPD-04 con una version mayor pide actualizar a pantalla completa`() {
        val repo = FakeRepo(DataResult.Success(v7))
        val model = vm(repo)
        assertEquals(UpdateUiState.None, model.state.value)
        model.onResume()
        assertEquals(listOf("tv"), repo.asked)
        assertEquals(UpdateUiState.Required(v7), model.state.value)
    }

    @Test fun `UPD-04 misma version, sin versiones o sin poder preguntar no bloquea`() {
        for (result in listOf<DataResult<AppRelease?>>(DataResult.Success(v7.copy(versionCode = 6)), DataResult.Success(null), DataResult.Failure(DataError.Network), DataResult.Failure(DataError.Server))) {
            val model = vm(FakeRepo(result))
            model.onResume()
            assertEquals(UpdateUiState.None, model.state.value, "$result")
        }
    }

    @Test fun `UPD-04 una falla al volver a preguntar no quita la pantalla de actualizar`() {
        val repo = FakeRepo(DataResult.Success(v7))
        val model = vm(repo)
        model.onResume()
        repo.result = DataResult.Failure(DataError.Network)
        model.onResume()
        assertEquals(UpdateUiState.Required(v7), model.state.value)
    }

    @Test fun `UPD-05 instalar baja con avance y abre el instalador`() {
        val installer = FakeInstaller().apply { gate = CompletableDeferred() }
        val model = vm(FakeRepo(DataResult.Success(v7)), installer)
        model.onResume()
        model.install()
        assertEquals(UpdateUiState.Downloading(v7, 0.5f), model.state.value)
        installer.gate!!.complete(Unit)
        assertEquals(UpdateUiState.Installing(v7), model.state.value)
        assertEquals(listOf(File("7.apk")), installer.installed)
    }

    @Test fun `UPD-05 descarga danada o sin red vuelve con el problema para reintentar`() {
        val installer = FakeInstaller().apply { failure = CorruptApkException() }
        val model = vm(FakeRepo(DataResult.Success(v7)), installer)
        model.onResume()
        model.install()
        assertEquals(UpdateUiState.Required(v7, UpdateProblem.Corrupt), model.state.value)
        installer.failure = IOException("sin red")
        model.install()
        assertEquals(UpdateUiState.Required(v7, UpdateProblem.Network), model.state.value)
        assertEquals(emptyList(), installer.installed)
        installer.failure = null
        model.install()
        assertIs<UpdateUiState.Installing>(model.state.value)
    }

    @Test fun `UPD-05 cancelar o fallar el instalador regresa a la pantalla de actualizar`() {
        val installer = FakeInstaller()
        val model = vm(FakeRepo(DataResult.Success(v7)), installer)
        model.onResume()
        model.install()
        installer.results.tryEmit(InstallResult.Cancelled)
        assertEquals(UpdateUiState.Required(v7), model.state.value)
        model.install()
        installer.results.tryEmit(InstallResult.Failed("conflicto"))
        assertEquals(UpdateUiState.Required(v7, UpdateProblem.InstallFailed), model.state.value)
        // Una tele que no avisa: al volver a la app también regresa
        model.install()
        model.onResume()
        assertEquals(UpdateUiState.Required(v7), model.state.value)
    }

    @Test fun `UPD-05 sin permiso explica, abre Ajustes y al volver con permiso sigue solo`() {
        val installer = FakeInstaller().apply { allowed = false }
        val model = vm(FakeRepo(DataResult.Success(v7)), installer)
        model.onResume()
        model.install()
        assertEquals(UpdateUiState.NeedsPermission(v7), model.state.value)
        model.openSettings()
        assertEquals(1, installer.settingsOpened)
        model.onResume()
        assertEquals(UpdateUiState.NeedsPermission(v7), model.state.value)
        installer.allowed = true
        model.onResume()
        assertIs<UpdateUiState.Installing>(model.state.value)
    }

    @Test fun `UPD-05 sin el ajuste en el aparato se instala igual y el sistema pregunta`() {
        val installer = FakeInstaller().apply { allowed = false; hasSettings = false }
        val model = vm(FakeRepo(DataResult.Success(v7)), installer)
        model.onResume()
        model.install()
        model.openSettings()
        assertIs<UpdateUiState.Installing>(model.state.value)
        assertEquals(1, installer.installed.size)
    }
}
