package com.mavros.archiver.mobile.detail

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mavros.archiver.core.data.CatalogRepository
import com.mavros.archiver.core.data.DataError
import com.mavros.archiver.core.data.DataResult
import com.mavros.archiver.core.model.MovieDetail
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

sealed interface DetailUiState {
    data object Loading : DetailUiState
    data class Error(val error: DataError) : DetailUiState
    data object NotAvailable : DetailUiState
    data class Content(val detail: MovieDetail) : DetailUiState
}

class DetailViewModel(private val repository: CatalogRepository, private val movieId: String) : ViewModel() {
    private val _state = MutableStateFlow<DetailUiState>(DetailUiState.Loading)
    val state: StateFlow<DetailUiState> = _state

    init { load() }

    fun retry() = load()

    private fun load() {
        _state.value = DetailUiState.Loading
        viewModelScope.launch {
            _state.value = when (val result = repository.movie(movieId)) {
                is DataResult.Success -> result.value?.let { DetailUiState.Content(it) } ?: DetailUiState.NotAvailable
                is DataResult.Failure -> DetailUiState.Error(result.error)
            }
        }
    }
}
