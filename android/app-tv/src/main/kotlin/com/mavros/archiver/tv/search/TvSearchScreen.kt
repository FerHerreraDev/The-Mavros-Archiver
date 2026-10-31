package com.mavros.archiver.tv.search

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Button
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.mavros.archiver.core.android.search.RequestState
import com.mavros.archiver.core.android.search.SearchUiState
import com.mavros.archiver.core.android.search.message
import com.mavros.archiver.core.design.MavrosColors
import com.mavros.archiver.core.model.SearchHit
import com.mavros.archiver.tv.catalog.Message
import com.mavros.archiver.tv.catalog.errorText
import com.mavros.archiver.tv.ui.TvPosterCard

/** SRCH-05: campo de texto (teclado o voz del control) y resultados en cuadrícula; sin resultados, "Pedir «…»" */
@Composable
fun TvSearchScreen(
    state: SearchUiState,
    onQuery: (String) -> Unit,
    onOpenMovie: (String) -> Unit,
    onOpenSeries: (String) -> Unit,
    onRequest: () -> Unit,
    onRetry: () -> Unit,
) {
    val field = remember { FocusRequester() }
    val first = remember { FocusRequester() }
    val focusManager = LocalFocusManager.current
    var focused by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { runCatching { field.requestFocus() } }

    Column(Modifier.fillMaxSize().background(MavrosColors.Background).padding(horizontal = 48.dp, vertical = 32.dp)) {
        Text("Buscar", style = MaterialTheme.typography.headlineSmall, color = MavrosColors.Foreground)
        Spacer(Modifier.height(16.dp))
        BasicTextField(
            value = state.query,
            onValueChange = onQuery,
            singleLine = true,
            textStyle = TextStyle(color = MavrosColors.Foreground, fontSize = 22.sp),
            cursorBrush = SolidColor(MavrosColors.Accent),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            // "Buscar" en el teclado baja a los resultados
            keyboardActions = KeyboardActions(onSearch = { if (state.results.isNotEmpty()) runCatching { first.requestFocus() } else focusManager.moveFocus(FocusDirection.Down) }),
            modifier = Modifier
                .fillMaxWidth()
                .focusRequester(field)
                .onFocusChanged { focused = it.isFocused }
                // Con el control: abajo sale del campo hacia los resultados (o "Pedir")
                .onPreviewKeyEvent { event ->
                    if (event.type != KeyEventType.KeyDown || event.key != Key.DirectionDown) return@onPreviewKeyEvent false
                    // Siempre al primer resultado (el de la izquierda), no al que quede debajo del centro
                    if (state.results.isNotEmpty() && runCatching { first.requestFocus() }.isSuccess) true else focusManager.moveFocus(FocusDirection.Down)
                }
                .testTag("tv-search-field"),
            decorationBox = { inner ->
                Box(
                    Modifier
                        .fillMaxWidth()
                        .background(MavrosColors.Card, RoundedCornerShape(12.dp))
                        .border(2.dp, if (focused) MavrosColors.Accent else MavrosColors.Border, RoundedCornerShape(12.dp))
                        .padding(horizontal = 20.dp, vertical = 14.dp),
                ) {
                    if (state.query.isEmpty()) Text("Película o serie", color = MavrosColors.MutedForeground, fontSize = 22.sp)
                    inner()
                }
            },
        )
        Spacer(Modifier.height(24.dp))
        val error = state.error
        when {
            error != null -> Message(errorText(error), onRetry)
            state.noResults -> NoResults(state, onRequest)
            else -> LazyVerticalGrid(
                columns = GridCells.Adaptive(minSize = 150.dp),
                contentPadding = PaddingValues(top = 12.dp, bottom = 48.dp),
                horizontalArrangement = Arrangement.spacedBy(24.dp),
                verticalArrangement = Arrangement.spacedBy(24.dp),
                modifier = Modifier.fillMaxSize().testTag("tv-search-results"),
            ) {
                itemsIndexed(state.results, key = { _, hit -> hit.id }) { index, hit ->
                    val modifier = if (index == 0) Modifier.focusRequester(first) else Modifier
                    when (hit) {
                        is SearchHit.MovieHit -> TvPosterCard(hit.movie, onClick = { onOpenMovie(hit.movie.id) }, modifier = modifier)
                        is SearchHit.SeriesHit -> TvPosterCard(
                            hit.series.series,
                            hit.series.series.title,
                            listOfNotNull(hit.series.series.releaseYear?.toString(), hit.series.countLabel).joinToString(" · "),
                            onClick = { onOpenSeries(hit.series.series.id) },
                            modifier = modifier,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun NoResults(state: SearchUiState, onRequest: () -> Unit) {
    val title = state.query.trim()
    Column(Modifier.testTag("tv-no-results")) {
        Text("No encontramos «$title».", color = MavrosColors.Foreground, style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(20.dp))
        val message = state.request.message()
        if (state.request != RequestState.Sent) {
            Button(onClick = onRequest, enabled = state.request != RequestState.Sending, modifier = Modifier.testTag("tv-request")) {
                Text(if (state.request == RequestState.Sending) "Enviando…" else "Pedir «$title»")
            }
        }
        if (message != null) {
            Spacer(Modifier.height(12.dp))
            Text(message, color = if (state.request == RequestState.Sent) MavrosColors.Foreground else MavrosColors.Accent, modifier = Modifier.testTag("tv-request-message"))
        }
    }
}
