package com.mavros.archiver.core.android.update

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mavros.archiver.core.data.AppUpdateRepository
import com.mavros.archiver.core.data.DataResult
import com.mavros.archiver.core.model.AppRelease
import com.mavros.archiver.core.model.UpdateRules
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/** Por qué no se pudo instalar (se muestra con "Reintentar") */
enum class UpdateProblem { Network, Corrupt, InstallFailed }

sealed interface UpdateUiState {
    /** Al día, o no se pudo preguntar: la app sigue normal (UPD-04) */
    data object None : UpdateUiState
    data class Required(val release: AppRelease, val problem: UpdateProblem? = null) : UpdateUiState
    data class Downloading(val release: AppRelease, val progress: Float?) : UpdateUiState
    /** El aparato no deja instalar desde esta app: hay que permitirlo en Ajustes */
    data class NeedsPermission(val release: AppRelease) : UpdateUiState
    data class Installing(val release: AppRelease) : UpdateUiState
}

/** Actualización obligatoria de la app Android (UPD-04, UPD-05) */
class UpdateViewModel(
    private val repository: AppUpdateRepository,
    private val installer: ApkInstaller,
    private val app: String,
    private val installedVersionCode: Int,
) : ViewModel() {
    private val _state = MutableStateFlow<UpdateUiState>(UpdateUiState.None)
    val state: StateFlow<UpdateUiState> = _state
    private var check: Job? = null

    init {
        viewModelScope.launch {
            installer.results.collect { result ->
                val release = (_state.value as? UpdateUiState.Installing)?.release ?: return@collect
                _state.value = UpdateUiState.Required(release, if (result is InstallResult.Failed) UpdateProblem.InstallFailed else null)
            }
        }
    }

    /** Al abrir la app o volver a ella (UPD-04) */
    fun onResume() {
        when (val s = _state.value) {
            // Volvió de Ajustes con el permiso dado: sigue solo
            is UpdateUiState.NeedsPermission -> if (installer.canInstall()) install()
            // Volvió del instalador sin respuesta (algunas teles no avisan al cancelar)
            is UpdateUiState.Installing -> _state.value = UpdateUiState.Required(s.release)
            UpdateUiState.None, is UpdateUiState.Required -> checkForUpdate()
            is UpdateUiState.Downloading -> Unit
        }
    }

    private fun checkForUpdate() {
        if (check?.isActive == true) return
        check = viewModelScope.launch {
            val result = repository.latest(app)
            // Sin respuesta no se bloquea nada; tampoco se quita una pantalla que ya pedía actualizar
            val latest = (result as? DataResult.Success)?.value ?: return@launch
            val current = _state.value
            if (current !is UpdateUiState.None && current !is UpdateUiState.Required) return@launch
            if (UpdateRules.needsUpdate(installedVersionCode, latest)) {
                if (current !is UpdateUiState.Required || current.release != latest) _state.value = UpdateUiState.Required(latest)
            } else {
                _state.value = UpdateUiState.None
            }
        }
    }

    /** "Instalar" (o "Reintentar"). Sin permiso para instalar, primero se explica cómo darlo */
    fun install() {
        when (val s = _state.value) {
            is UpdateUiState.Required -> if (installer.canInstall()) start(s.release) else _state.value = UpdateUiState.NeedsPermission(s.release)
            is UpdateUiState.NeedsPermission -> start(s.release)
            else -> Unit
        }
    }

    /** "Abrir ajustes"; si el aparato no tiene ese ajuste, se instala igual y el sistema pregunta */
    fun openSettings() {
        val s = _state.value as? UpdateUiState.NeedsPermission ?: return
        if (!installer.openInstallSettings()) start(s.release)
    }

    private fun start(release: AppRelease) {
        _state.value = UpdateUiState.Downloading(release, null)
        viewModelScope.launch {
            val apk = try {
                installer.download(release) { progress -> _state.value = UpdateUiState.Downloading(release, progress) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: CorruptApkException) {
                _state.value = UpdateUiState.Required(release, UpdateProblem.Corrupt)
                return@launch
            } catch (e: Throwable) {
                _state.value = UpdateUiState.Required(release, UpdateProblem.Network)
                return@launch
            }
            _state.value = UpdateUiState.Installing(release)
            try {
                installer.install(apk)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Throwable) {
                _state.value = UpdateUiState.Required(release, UpdateProblem.InstallFailed)
            }
        }
    }
}
