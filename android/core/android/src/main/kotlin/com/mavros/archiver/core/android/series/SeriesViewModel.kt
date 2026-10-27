package com.mavros.archiver.core.android.series

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mavros.archiver.core.data.CatalogRepository
import com.mavros.archiver.core.data.DataError
import com.mavros.archiver.core.data.DataResult
import com.mavros.archiver.core.data.ProgressRepository
import com.mavros.archiver.core.model.SeriesDetail
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

sealed interface SeriesUiState {
    data object Loading : SeriesUiState
    data class Error(val error: DataError) : SeriesUiState
    data object NotAvailable : SeriesUiState
    /** [season]: la temporada que se ve; al abrir, la del episodio que sigue (SER-09) */
    data class Content(val detail: SeriesDetail, val season: Int?) : SeriesUiState
}

/** Página de la serie en teléfono y tele (SER-15) */
class SeriesViewModel(
    private val repository: CatalogRepository,
    private val seriesId: String,
    progress: ProgressRepository? = null,
) : ViewModel() {
    private val _state = MutableStateFlow<SeriesUiState>(SeriesUiState.Loading)
    val state: StateFlow<SeriesUiState> = _state
    private var job: Job? = null

    init {
        load()
        // Al volver del reproductor el botón y las barras muestran el progreso nuevo (MOB-19)
        progress?.let { p -> viewModelScope.launch { p.saved.collect { refresh() } } }
    }

    fun retry() = load()

    fun refresh() = load(showLoading = false)

    fun selectSeason(season: Int) {
        val current = _state.value as? SeriesUiState.Content ?: return
        _state.value = current.copy(season = season)
    }

    private fun load(showLoading: Boolean = true) {
        job?.cancel()
        if (showLoading || _state.value !is SeriesUiState.Content) _state.value = SeriesUiState.Loading
        job = viewModelScope.launch {
            val result = repository.series(seriesId)
            if (!isActive) return@launch
            val previous = _state.value as? SeriesUiState.Content
            when (result) {
                is DataResult.Success -> _state.value = result.value?.let { detail ->
                    // Al refrescar se queda en la temporada que estaba viendo
                    val season = previous?.season?.takeIf { it in detail.seasons }
                        ?: detail.next?.episode?.seasonNumber
                        ?: detail.seasons.firstOrNull()
                    SeriesUiState.Content(detail, season)
                } ?: SeriesUiState.NotAvailable
                is DataResult.Failure -> if (previous == null) _state.value = SeriesUiState.Error(result.error)
            }
        }
    }
}
