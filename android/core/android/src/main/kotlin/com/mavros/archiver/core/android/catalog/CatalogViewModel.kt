package com.mavros.archiver.core.android.catalog

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mavros.archiver.core.data.CatalogRepository
import com.mavros.archiver.core.data.DataError
import com.mavros.archiver.core.data.DataResult
import com.mavros.archiver.core.data.ProgressRepository
import com.mavros.archiver.core.model.Catalog
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

sealed interface CatalogUiState {
    data object Loading : CatalogUiState
    data class Error(val error: DataError) : CatalogUiState
    data class Content(val catalog: Catalog, val genre: String?) : CatalogUiState
}

class CatalogViewModel(private val repository: CatalogRepository, progress: ProgressRepository? = null) : ViewModel() {
    private val _state = MutableStateFlow<CatalogUiState>(CatalogUiState.Loading)
    val state: StateFlow<CatalogUiState> = _state
    private var genre: String? = null
    private var job: Job? = null

    init {
        load()
        // "Seguir viendo" al día cuando el reproductor termina de guardar (MOB-19)
        progress?.let { p -> viewModelScope.launch { p.saved.collect { refresh() } } }
    }

    fun selectGenre(value: String?) {
        genre = value
        load()
    }

    fun retry() = load()

    /** Al volver del detalle/reproductor: refresca "Seguir viendo" sin mostrar el spinner */
    fun refresh() = load(showLoading = false)

    private fun load(showLoading: Boolean = true) {
        job?.cancel()
        if (showLoading && _state.value !is CatalogUiState.Content) _state.value = CatalogUiState.Loading
        job = viewModelScope.launch {
            val result = repository.catalog(genre)
            // Una carga reemplazada por otra no toca la pantalla (MOB-12)
            if (!isActive) return@launch
            when (result) {
                is DataResult.Success -> _state.value = CatalogUiState.Content(result.value, genre)
                is DataResult.Failure -> _state.update { current ->
                    // Con contenido ya mostrado, un refresco fallido no lo borra
                    if (!showLoading && current is CatalogUiState.Content) current else CatalogUiState.Error(result.error)
                }
            }
        }
    }
}
