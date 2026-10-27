package com.mavros.archiver.core.android.player

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mavros.archiver.core.data.CatalogRepository
import com.mavros.archiver.core.data.DataError
import com.mavros.archiver.core.data.DataResult
import com.mavros.archiver.core.data.PlaybackRepository
import com.mavros.archiver.core.data.PlaybackSource
import com.mavros.archiver.core.model.Movie
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

sealed interface PlayerUiState {
    data object Loading : PlayerUiState
    data class Ready(val source: PlaybackSource) : PlayerUiState
    data object NotAvailable : PlayerUiState
    data class Error(val error: DataError) : PlayerUiState
}

/**
 * Pide la primera URL firmada (MOB-13). Las renovaciones las hace PlaybackService.
 * Con [catalog], también busca el siguiente episodio para ofrecerlo al terminar (SER-16).
 */
class PlayerViewModel(
    private val repository: PlaybackRepository,
    private val movieId: String,
    private val catalog: CatalogRepository? = null,
) : ViewModel() {
    private val _state = MutableStateFlow<PlayerUiState>(PlayerUiState.Loading)
    val state: StateFlow<PlayerUiState> = _state
    private val _next = MutableStateFlow<Movie?>(null)
    val next: StateFlow<Movie?> = _next
    private var job: Job? = null

    init {
        load()
        catalog?.let { c ->
            // Si falla no pasa nada: simplemente no se ofrece el siguiente
            viewModelScope.launch { (c.nextEpisode(movieId) as? DataResult.Success)?.let { _next.value = it.value } }
        }
    }

    fun retry() = load()

    private fun load() {
        job?.cancel()
        _state.value = PlayerUiState.Loading
        job = viewModelScope.launch {
            val result = repository.source(movieId)
            if (!isActive) return@launch
            _state.value = when (result) {
                is DataResult.Success -> result.value?.let { PlayerUiState.Ready(it) } ?: PlayerUiState.NotAvailable
                is DataResult.Failure -> PlayerUiState.Error(result.error)
            }
        }
    }
}

/** Opciones del selector de calidad: "Automática" y cada resolución, de mayor a menor (MOB-14) */
fun qualityLabels(heights: List<Int>): List<Pair<Int?, String>> =
    listOf<Pair<Int?, String>>(null to "Automática") + heights.filter { it > 0 }.distinct().sortedDescending().map { it to "${it}p" }

/** Segundos de la cuenta regresiva de "Siguiente episodio" (SER-16) */
const val NEXT_EPISODE_COUNTDOWN_SECONDS = 10
