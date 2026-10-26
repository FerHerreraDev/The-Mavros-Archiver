package com.mavros.archiver.mobile.detail

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mavros.archiver.core.data.CatalogRepository
import com.mavros.archiver.core.data.DataError
import com.mavros.archiver.core.data.DataResult
import com.mavros.archiver.core.data.ProgressRepository
import com.mavros.archiver.core.model.MovieDetail
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.Job
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

sealed interface DetailUiState {
    data object Loading : DetailUiState
    data class Error(val error: DataError) : DetailUiState
    data object NotAvailable : DetailUiState
    data class Content(val detail: MovieDetail) : DetailUiState
}

class DetailViewModel(
    private val repository: CatalogRepository,
    private val movieId: String,
    progress: ProgressRepository? = null,
) : ViewModel() {
    private val _state = MutableStateFlow<DetailUiState>(DetailUiState.Loading)
    val state: StateFlow<DetailUiState> = _state

    init {
        load()
        // El guardado de salida del reproductor puede llegar después de volver a esta pantalla (MOB-19)
        progress?.let { p -> viewModelScope.launch { p.saved.filter { it == movieId }.collect { refresh() } } }
    }

    fun retry() = load()

    /** Al volver del reproductor: progreso nuevo sin mostrar el skeleton (MOB-19) */
    fun refresh() = load(showLoading = false)

    private var job: Job? = null

    private fun load(showLoading: Boolean = true) {
        job?.cancel()
        if (showLoading || _state.value !is DetailUiState.Content) _state.value = DetailUiState.Loading
        job = viewModelScope.launch {
            val result = repository.movie(movieId)
            if (!isActive) return@launch
            when (result) {
                is DataResult.Success -> _state.value = result.value?.let { DetailUiState.Content(it) } ?: DetailUiState.NotAvailable
                // Con el detalle ya en pantalla, un refresco fallido no lo borra
                is DataResult.Failure -> if (showLoading || _state.value !is DetailUiState.Content) _state.value = DetailUiState.Error(result.error)
            }
        }
    }
}
