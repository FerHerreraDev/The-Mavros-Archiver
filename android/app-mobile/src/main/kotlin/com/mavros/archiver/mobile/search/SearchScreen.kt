package com.mavros.archiver.mobile.search

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.SearchOff
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mavros.archiver.core.android.search.RequestState
import com.mavros.archiver.core.android.search.SearchUiState
import com.mavros.archiver.core.android.search.SearchViewModel
import com.mavros.archiver.core.android.search.message
import com.mavros.archiver.core.design.MavrosColors
import com.mavros.archiver.core.model.SearchHit
import com.mavros.archiver.mobile.ui.ErrorState
import com.mavros.archiver.mobile.ui.PosterCard

@Composable
fun SearchScreen(viewModel: SearchViewModel, onBack: () -> Unit, onOpenMovie: (String) -> Unit, onOpenSeries: (String) -> Unit) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    SearchContent(state, onBack, viewModel::onQuery, onOpenMovie, onOpenSeries, viewModel::request, viewModel::retry)
}

/** SRCH-04: campo con el teclado abierto y resultados mientras escribes; sin resultados, "Pedir «…»" (SRCH-03) */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SearchContent(
    state: SearchUiState,
    onBack: () -> Unit,
    onQuery: (String) -> Unit,
    onOpenMovie: (String) -> Unit,
    onOpenSeries: (String) -> Unit,
    onRequest: () -> Unit,
    onRetry: () -> Unit,
) {
    val focus = remember { FocusRequester() }
    val keyboard = LocalSoftwareKeyboardController.current
    LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Volver") } },
                title = {
                    TextField(
                        value = state.query,
                        onValueChange = onQuery,
                        placeholder = { Text("Buscar películas y series") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                        keyboardActions = KeyboardActions(onSearch = { keyboard?.hide() }),
                        trailingIcon = {
                            if (state.query.isNotEmpty()) IconButton(onClick = { onQuery("") }) { Icon(Icons.Outlined.Close, contentDescription = "Borrar búsqueda") }
                        },
                        colors = TextFieldDefaults.colors(
                            focusedContainerColor = MavrosColors.Card,
                            unfocusedContainerColor = MavrosColors.Card,
                            focusedIndicatorColor = MavrosColors.Accent,
                        ),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth().padding(end = 12.dp).focusRequester(focus).testTag("search-field"),
                    )
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
    ) { padding ->
        val error = state.error
        when {
            error != null -> ErrorState(error, onRetry, Modifier.padding(padding))
            state.loading -> Column(Modifier.fillMaxSize().padding(padding), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                CircularProgressIndicator(color = MavrosColors.Accent)
            }
            state.noResults -> NoResults(state, onRequest, Modifier.padding(padding))
            else -> LazyVerticalGrid(
                columns = GridCells.Adaptive(minSize = 120.dp),
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = padding.calculateTopPadding() + 8.dp, bottom = padding.calculateBottomPadding() + 24.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
                modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).testTag("search-results"),
            ) {
                items(state.results, key = { it.id }) { hit ->
                    when (hit) {
                        is SearchHit.MovieHit -> PosterCard(hit.movie, onClick = { onOpenMovie(hit.movie.id) })
                        is SearchHit.SeriesHit -> PosterCard(
                            poster = hit.series.series,
                            title = hit.series.series.title,
                            meta = listOfNotNull(hit.series.series.releaseYear?.toString(), hit.series.countLabel).joinToString(" · "),
                            onClick = { onOpenSeries(hit.series.series.id) },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun NoResults(state: SearchUiState, onRequest: () -> Unit, modifier: Modifier = Modifier) {
    val title = state.query.trim()
    Column(modifier.fillMaxSize().padding(32.dp).testTag("no-results"), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Icon(Icons.Outlined.SearchOff, contentDescription = null, tint = MavrosColors.MutedForeground)
        Spacer(Modifier.height(12.dp))
        Text("No encontramos «$title».", color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
        Spacer(Modifier.height(16.dp))
        val message = state.request.message()
        if (state.request == RequestState.Sent) {
            Text(message!!, textAlign = TextAlign.Center, modifier = Modifier.testTag("request-message"))
        } else {
            Button(onClick = onRequest, enabled = state.request != RequestState.Sending, shape = RoundedCornerShape(999.dp), modifier = Modifier.testTag("request")) {
                if (state.request == RequestState.Sending) CircularProgressIndicator(Modifier.height(16.dp), strokeWidth = 2.dp) else Text("Pedir «$title»")
            }
            if (message != null) {
                Spacer(Modifier.height(8.dp))
                Text(message, color = MaterialTheme.colorScheme.error, textAlign = TextAlign.Center, modifier = Modifier.testTag("request-message"))
            }
        }
    }
}
