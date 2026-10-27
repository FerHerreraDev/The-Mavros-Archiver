package com.mavros.archiver.core.android.player

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mavros.archiver.core.data.CatalogRepository
import com.mavros.archiver.core.data.DataError
import com.mavros.archiver.core.data.DataResult
import com.mavros.archiver.core.data.PlaybackRepository
import com.mavros.archiver.core.data.PlaybackSource
import com.mavros.archiver.core.data.PlaylistRepository
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

/** Lo que se ofrece al terminar: el siguiente episodio (SER-16) o lo siguiente de la lista (PL-07) */
data class UpNext(val movie: Movie, val startAt: Double, val inList: Boolean) {
    val heading: String get() = if (inList) "Siguiente en la lista" else "Siguiente episodio"
}

/**
 * Pide la primera URL firmada (MOB-13). Las renovaciones las hace PlaybackService.
 * Busca qué ofrecer al terminar: con [listId], lo siguiente de esa lista; si no, con [catalog], el
 * siguiente episodio. Si falla no pasa nada: simplemente no se ofrece.
 */
class PlayerViewModel(
    private val repository: PlaybackRepository,
    private val movieId: String,
    private val catalog: CatalogRepository? = null,
    private val playlists: PlaylistRepository? = null,
    private val listId: String? = null,
) : ViewModel() {
    private val _state = MutableStateFlow<PlayerUiState>(PlayerUiState.Loading)
    val state: StateFlow<PlayerUiState> = _state
    private val _next = MutableStateFlow<UpNext?>(null)
    val next: StateFlow<UpNext?> = _next
    private var job: Job? = null

    init {
        load()
        viewModelScope.launch {
            _next.value = if (listId != null) {
                (playlists?.next(listId, movieId) as? DataResult.Success)?.value?.let { UpNext(it.episode, it.startAt, inList = true) }
            } else {
                (catalog?.nextEpisode(movieId) as? DataResult.Success)?.value?.let { UpNext(it, 0.0, inList = false) }
            }
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
