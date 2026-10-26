package com.mavros.archiver.core.android.player

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mavros.archiver.core.data.DataError
import com.mavros.archiver.core.data.DataResult
import com.mavros.archiver.core.data.PlaybackRepository
import com.mavros.archiver.core.data.PlaybackSource
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

/** Pide la primera URL firmada (MOB-13). Las renovaciones las hace PlaybackService. */
class PlayerViewModel(private val repository: PlaybackRepository, private val movieId: String) : ViewModel() {
    private val _state = MutableStateFlow<PlayerUiState>(PlayerUiState.Loading)
    val state: StateFlow<PlayerUiState> = _state
    private var job: Job? = null

    init { load() }

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
