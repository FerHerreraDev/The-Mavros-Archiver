package com.mavros.archiver.tv.catalog

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.withFrameNanos
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.tv.material3.Button
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.OutlinedButton
import androidx.tv.material3.Text
import com.mavros.archiver.core.android.catalog.CatalogUiState
import com.mavros.archiver.core.data.DataError
import com.mavros.archiver.core.design.MavrosColors
import com.mavros.archiver.core.model.Catalog
import com.mavros.archiver.core.model.CatalogSeries
import com.mavros.archiver.core.model.HasPoster
import com.mavros.archiver.core.model.formatDurationShort
import com.mavros.archiver.core.model.Movie
import com.mavros.archiver.core.model.ProgressRules
import com.mavros.archiver.tv.ui.TvCatalogSkeleton
import com.mavros.archiver.tv.ui.TvPosterCard

/**
 * Una tarjeta de fila: película, episodio (en "Seguir viendo", con el póster y título de su serie)
 * o serie. [id] es la película/episodio que se abre, o la serie si [isSeries].
 */
data class TvItem(val id: String, val poster: HasPoster, val title: String, val meta: String, val progress: Float? = null, val isSeries: Boolean = false)

data class TvRow(val title: String, val items: List<TvItem>)

private fun movieItem(movie: Movie, progress: Float? = null) =
    TvItem(movie.id, movie, movie.title, listOfNotNull(movie.releaseYear?.toString(), formatDurationShort(movie.durationSeconds)).joinToString(" · "), progress)

private fun seriesItem(show: CatalogSeries) =
    TvItem(show.series.id, show.series, show.series.title, listOfNotNull(show.series.releaseYear?.toString(), show.countLabel).joinToString(" · "), isSeries = true)

/** TV-04 / SER-15: "Seguir viendo", "Recién agregadas", "Series" y una fila por género, en ese orden; sin filas vacías */
fun tvRows(catalog: Catalog): List<TvRow> = buildList {
    if (catalog.continueWatching.isNotEmpty()) {
        add(
            TvRow(
                "Seguir viendo",
                catalog.continueWatching.map { item ->
                    val progress = ProgressRules.progressRatio(item.positionSeconds, item.movie.durationSeconds)
                    val series = item.series
                    if (series == null) movieItem(item.movie, progress)
                    else TvItem(item.movie.id, series, series.title, "${item.movie.episodeTag} · ${item.movie.title}", progress)
                },
            ),
        )
    }
    if (catalog.recent.isNotEmpty()) add(TvRow("Recién agregadas", catalog.recent.map { movieItem(it) }))
    if (catalog.series.isNotEmpty()) add(TvRow("Series", catalog.series.map(::seriesItem)))
    catalog.genres.forEach { genre ->
        val items = catalog.recent.filter { genre in it.genres }.map { movieItem(it) } +
            catalog.series.filter { genre in it.series.genres }.map(::seriesItem)
        if (items.isNotEmpty()) add(TvRow(genre.replaceFirstChar { it.uppercase() }, items))
    }
}

@Composable
fun TvCatalogScreen(state: CatalogUiState, onOpenMovie: (String) -> Unit, onSignOut: () -> Unit, onRetry: () -> Unit, onOpenSeries: (String) -> Unit = {}) {
    val signOut = remember { FocusRequester() }
    Column(Modifier.fillMaxSize().background(MavrosColors.Background)) {
        Row(Modifier.fillMaxWidth().padding(start = 48.dp, end = 48.dp, top = 32.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(
                buildAnnotatedString {
                    append("THE MAVROS ")
                    withStyle(SpanStyle(color = MavrosColors.Accent)) { append("ARCHIVER") }
                },
                style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
                color = MavrosColors.Foreground,
                modifier = Modifier.weight(1f),
            )
            OutlinedButton(onClick = onSignOut, modifier = Modifier.focusRequester(signOut).testTag("tv-sign-out")) { Text("Cerrar sesión") }
        }
        when (state) {
            CatalogUiState.Loading -> TvCatalogSkeleton()
            is CatalogUiState.Error -> Message(errorText(state.error), onRetry)
            is CatalogUiState.Content -> {
                val rows = remember(state.catalog) { tvRows(state.catalog) }
                if (rows.isEmpty()) Message("La bóveda está vacía por ahora.", null) else Rows(rows, onOpenMovie, onOpenSeries, signOut)
            }
        }
    }
}

@Composable
private fun Rows(rows: List<TvRow>, onOpenMovie: (String) -> Unit, onOpenSeries: (String) -> Unit, signOut: FocusRequester) {
    val first = remember { FocusRequester() }
    // Al abrir, el control queda en la primera película (no en "Cerrar sesión"). Las tarjetas de
    // una LazyRow se crean después de esta composición: se reintenta cuadro a cuadro hasta que exista.
    LaunchedEffect(Unit) {
        repeat(30) {
            withFrameNanos { }
            if (runCatching { first.requestFocus() }.isSuccess) return@LaunchedEffect
        }
    }
    LazyColumn(
        contentPadding = PaddingValues(top = 24.dp, bottom = 48.dp),
        verticalArrangement = Arrangement.spacedBy(32.dp),
        modifier = Modifier.fillMaxSize().testTag("tv-catalog"),
    ) {
        rows.forEachIndexed { rowIndex, row ->
            item(key = "row-${row.title}") {
                Column {
                    Text(
                        row.title,
                        style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                        color = MavrosColors.Foreground,
                        modifier = Modifier.padding(start = 48.dp).semantics { heading() },
                    )
                    Spacer(Modifier.height(16.dp))
                    LazyRow(
                        contentPadding = PaddingValues(horizontal = 48.dp, vertical = 12.dp),
                        horizontalArrangement = Arrangement.spacedBy(24.dp),
                        modifier = Modifier.testTag("tv-row-$rowIndex"),
                    ) {
                        items(row.items, key = { "${row.title}-${it.id}" }) { item ->
                            var focus: Modifier = if (rowIndex == 0 && item == row.items.first()) Modifier.focusRequester(first) else Modifier
                            // "Cerrar sesión" queda arriba a la derecha, fuera del haz de la flecha: ↑ desde la
                            // primera fila lleva ahí explícitamente (TV-07)
                            if (rowIndex == 0) focus = focus.focusProperties { up = signOut }
                            TvPosterCard(
                                item.poster,
                                item.title,
                                item.meta,
                                onClick = { if (item.isSeries) onOpenSeries(item.id) else onOpenMovie(item.id) },
                                progress = item.progress,
                                modifier = focus,
                                tagId = item.id,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun Message(text: String, onRetry: (() -> Unit)?) {
    val retry = remember { FocusRequester() }
    Column(Modifier.fillMaxSize().testTag("tv-message"), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Text(text, color = MavrosColors.Foreground, style = MaterialTheme.typography.titleLarge)
        if (onRetry != null) {
            Spacer(Modifier.height(24.dp))
            Button(onClick = onRetry, modifier = Modifier.focusRequester(retry)) { Text("Reintentar") }
            LaunchedEffect(Unit) { runCatching { retry.requestFocus() } }
        }
    }
}

fun errorText(error: DataError) = when (error) {
    DataError.Network -> "Sin conexión. Revisa el internet de la tele."
    DataError.Unauthorized -> "Tu sesión ya no es válida."
    DataError.Server -> "Algo salió mal. Intenta de nuevo en un momento."
}
