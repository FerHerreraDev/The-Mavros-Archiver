package com.mavros.archiver.core.android.lists

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mavros.archiver.core.data.DataError
import com.mavros.archiver.core.data.DataResult
import com.mavros.archiver.core.data.PlaylistRepository
import com.mavros.archiver.core.data.ProgressRepository
import com.mavros.archiver.core.model.PlaylistDetail
import com.mavros.archiver.core.model.PlaylistMembership
import com.mavros.archiver.core.model.PlaylistSummary
import com.mavros.archiver.core.model.PlaylistTarget
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

sealed interface ListsUiState {
    data object Loading : ListsUiState
    data class Error(val error: DataError) : ListsUiState
    data class Content(val lists: List<PlaylistSummary>) : ListsUiState
}

/** Mis listas (PL-07) */
class ListsViewModel(private val repository: PlaylistRepository) : ViewModel() {
    private val _state = MutableStateFlow<ListsUiState>(ListsUiState.Loading)
    val state: StateFlow<ListsUiState> = _state
    private var job: Job? = null

    init { load() }

    fun retry() = load()
    fun refresh() = load(showLoading = false)

    private fun load(showLoading: Boolean = true) {
        job?.cancel()
        if (showLoading || _state.value !is ListsUiState.Content) _state.value = ListsUiState.Loading
        job = viewModelScope.launch {
            val result = repository.lists()
            if (!isActive) return@launch
            when (result) {
                is DataResult.Success -> _state.value = ListsUiState.Content(result.value)
                is DataResult.Failure -> if (_state.value !is ListsUiState.Content) _state.value = ListsUiState.Error(result.error)
            }
        }
    }
}

sealed interface PlaylistUiState {
    data object Loading : PlaylistUiState
    data class Error(val error: DataError) : PlaylistUiState
    data object NotAvailable : PlaylistUiState
    data class Content(val detail: PlaylistDetail) : PlaylistUiState
}

/** Una lista con sus elementos y "Reproducir lista" (PL-07) */
class PlaylistViewModel(
    private val repository: PlaylistRepository,
    private val playlistId: String,
    progress: ProgressRepository? = null,
) : ViewModel() {
    private val _state = MutableStateFlow<PlaylistUiState>(PlaylistUiState.Loading)
    val state: StateFlow<PlaylistUiState> = _state
    private var job: Job? = null

    init {
        load()
        // Al volver del reproductor "Reproducir lista" sigue donde iba
        progress?.let { p -> viewModelScope.launch { p.saved.collect { refresh() } } }
    }

    fun retry() = load()
    fun refresh() = load(showLoading = false)

    private fun load(showLoading: Boolean = true) {
        job?.cancel()
        if (showLoading || _state.value !is PlaylistUiState.Content) _state.value = PlaylistUiState.Loading
        job = viewModelScope.launch {
            val result = repository.playlist(playlistId)
            if (!isActive) return@launch
            when (result) {
                is DataResult.Success -> _state.value = result.value?.let { PlaylistUiState.Content(it) } ?: PlaylistUiState.NotAvailable
                is DataResult.Failure -> if (_state.value !is PlaylistUiState.Content) _state.value = PlaylistUiState.Error(result.error)
            }
        }
    }
}

/** [busy]: la lista que se está cambiando ("new" al crear); todo bloqueado mientras tanto (UX-01) */
data class AddToListState(
    val lists: List<PlaylistMembership>? = null,
    val busy: String? = null,
    val error: String? = null,
)

/** "Agregar a lista" en el detalle y en la serie (PL-07) */
class AddToListViewModel(private val repository: PlaylistRepository, private val target: PlaylistTarget) : ViewModel() {
    private val _state = MutableStateFlow(AddToListState())
    val state: StateFlow<AddToListState> = _state

    init { load() }

    fun load() {
        viewModelScope.launch {
            when (val result = repository.membership(target)) {
                is DataResult.Success -> _state.update { it.copy(lists = result.value) }
                is DataResult.Failure -> _state.update { it.copy(error = "No se pudieron cargar tus listas.") }
            }
        }
    }

    fun toggle(playlistId: String) = change(playlistId) { repository.toggle(playlistId, target) }

    fun create(name: String) {
        if (name.isBlank() || name.trim().length > 100) {
            _state.update { it.copy(error = "Nombre de 1 a 100 caracteres.") }
            return
        }
        change("new") { repository.create(name, target) }
    }

    private fun change(key: String, action: suspend () -> DataResult<*>) {
        if (_state.value.busy != null) return // un segundo toque no repite la acción
        _state.update { it.copy(busy = key, error = null) }
        viewModelScope.launch {
            val result = action()
            val lists = (repository.membership(target) as? DataResult.Success)?.value
            _state.update {
                it.copy(
                    busy = null,
                    lists = lists ?: it.lists,
                    error = if (result is DataResult.Failure) "No se pudo guardar. Intenta de nuevo." else null,
                )
            }
        }
    }
}
