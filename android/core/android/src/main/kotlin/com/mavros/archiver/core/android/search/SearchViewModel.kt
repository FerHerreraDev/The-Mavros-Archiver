package com.mavros.archiver.core.android.search

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mavros.archiver.core.data.CatalogRepository
import com.mavros.archiver.core.data.DataError
import com.mavros.archiver.core.data.DataResult
import com.mavros.archiver.core.data.RequestRepository
import com.mavros.archiver.core.data.RequestResult
import com.mavros.archiver.core.model.Catalog
import com.mavros.archiver.core.model.SearchHit
import com.mavros.archiver.core.model.SearchRules
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** "Pedir «…»" (REQ-03) */
enum class RequestState { Idle, Sending, Sent, Duplicate, TooMany, Failed }

data class SearchUiState(
    val query: String = "",
    val loading: Boolean = true,
    val error: DataError? = null,
    val results: List<SearchHit> = emptyList(),
    val request: RequestState = RequestState.Idle,
) {
    /** Hay texto, el catálogo cargó y nada coincide: se ofrece pedirlo (SRCH-03) */
    val noResults get() = !loading && error == null && query.isNotBlank() && results.isEmpty() && SearchRules.normalize(query).isNotEmpty()
}

/** Búsqueda en teléfono y tele (SRCH-04, SRCH-05): el catálogo se carga una vez y se filtra al escribir */
class SearchViewModel(private val catalog: CatalogRepository, private val requests: RequestRepository) : ViewModel() {
    private val _state = MutableStateFlow(SearchUiState())
    val state: StateFlow<SearchUiState> = _state
    private var loaded: Catalog? = null

    init { load() }

    fun retry() = load()

    private fun load() {
        _state.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            when (val result = catalog.catalog(null)) {
                is DataResult.Success -> {
                    loaded = result.value
                    _state.update { it.copy(loading = false, results = SearchRules.searchCatalog(result.value, it.query)) }
                }
                is DataResult.Failure -> _state.update { it.copy(loading = false, error = result.error) }
            }
        }
    }

    fun onQuery(text: String) {
        val results = loaded?.let { SearchRules.searchCatalog(it, text) } ?: emptyList()
        // Otro texto es otro pedido posible
        _state.update { it.copy(query = text, results = results, request = if (it.request == RequestState.Sending) it.request else RequestState.Idle) }
    }

    fun request() {
        val title = _state.value.query
        if (_state.value.request == RequestState.Sending || title.isBlank()) return
        _state.update { it.copy(request = RequestState.Sending) }
        viewModelScope.launch {
            val outcome = when (val result = requests.request(title)) {
                is DataResult.Success -> when (result.value) {
                    RequestResult.Sent -> RequestState.Sent
                    RequestResult.Duplicate -> RequestState.Duplicate
                    RequestResult.TooMany -> RequestState.TooMany
                }
                is DataResult.Failure -> RequestState.Failed
            }
            _state.update { it.copy(request = outcome) }
        }
    }
}

/** Textos iguales a la web (REQ-02, REQ-03) */
fun RequestState.message(): String? = when (this) {
    RequestState.Sent -> "Listo, se lo pedimos al admin."
    RequestState.Duplicate -> "Ya lo pediste y sigue pendiente."
    RequestState.TooMany -> "Tienes 20 pedidos pendientes: espera a que se resuelvan."
    RequestState.Failed -> "No se pudo enviar el pedido."
    RequestState.Idle, RequestState.Sending -> null
}
