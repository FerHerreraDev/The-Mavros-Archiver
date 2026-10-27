package com.mavros.archiver.tv.series

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.layout.Spacer
import androidx.tv.material3.CardDefaults
import androidx.tv.material3.Card
import androidx.tv.material3.Border
import androidx.compose.foundation.BorderStroke
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.draw.blur
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.tv.material3.Button
import androidx.tv.material3.ExperimentalTvMaterial3Api
import androidx.tv.material3.FilterChip
import androidx.tv.material3.ListItem
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.mavros.archiver.core.android.series.SeriesUiState
import com.mavros.archiver.core.design.MavrosColors
import com.mavros.archiver.core.design.MavrosLoader
import com.mavros.archiver.core.design.MonoLabel
import com.mavros.archiver.core.design.PosterImage
import com.mavros.archiver.core.model.CatalogSeries
import com.mavros.archiver.core.model.Movie
import com.mavros.archiver.core.model.ProgressRules
import com.mavros.archiver.core.model.SeriesDetail
import com.mavros.archiver.core.model.formatDurationShort
import com.mavros.archiver.core.model.seasonName
import com.mavros.archiver.tv.catalog.Message
import com.mavros.archiver.tv.catalog.errorText

/** SER-15: página de la serie en la tele, con el botón de "qué sigue" enfocado al abrir */
@Composable
fun TvSeriesScreen(state: SeriesUiState, onPlay: (Movie, Double) -> Unit, onSelectSeason: (Int) -> Unit, onRetry: () -> Unit, extra: @Composable () -> Unit = {}) {
    Box(Modifier.fillMaxSize().background(MavrosColors.Background)) {
        when (state) {
            SeriesUiState.Loading -> MavrosLoader(Modifier.align(Alignment.Center).testTag("tv-loading"), size = 72.dp)
            is SeriesUiState.Error -> Message(errorText(state.error), onRetry)
            SeriesUiState.NotAvailable -> Message("Esta serie no está disponible.", null)
            is SeriesUiState.Content -> Body(state.detail, state.season, onPlay, onSelectSeason, extra)
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun Body(detail: SeriesDetail, season: Int?, onPlay: (Movie, Double) -> Unit, onSelectSeason: (Int) -> Unit, extra: @Composable () -> Unit) {
    val series = detail.series
    val play = remember { FocusRequester() }
    // Los botones y las tarjetas se crean después de esta composición: se reintenta cuadro a cuadro
    LaunchedEffect(series.id) {
        repeat(30) {
            withFrameNanos { }
            if (runCatching { play.requestFocus() }.isSuccess) return@LaunchedEffect
        }
    }
    val shown = detail.episodes.filter { it.seasonNumber == season }

    Box(Modifier.fillMaxSize()) {
        // Fondo: imagen horizontal (o el póster desenfocado) con degradados para leer encima (SER-17)
        val background = series.background
        PosterImage(background, Modifier.fillMaxSize().then(if (background.isWide) Modifier else Modifier.blur(32.dp))) {}
        Box(Modifier.fillMaxSize().background(Brush.horizontalGradient(0f to MavrosColors.Background, 0.55f to MavrosColors.Background.copy(alpha = 0.7f), 1f to Color.Transparent)))
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0.45f to Color.Transparent, 1f to MavrosColors.Background)))

        Column(Modifier.fillMaxSize().padding(start = 64.dp, top = 48.dp, bottom = 32.dp).testTag("tv-series"), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Column(Modifier.width(620.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(series.title, style = MaterialTheme.typography.displaySmall.copy(fontWeight = FontWeight.Bold), color = MavrosColors.Foreground, modifier = Modifier.testTag("tv-title"))
                Text(
                    (listOfNotNull(series.releaseYear?.toString(), CatalogSeries(series, detail.seasons.size, detail.episodes.size).countLabel) + series.genres)
                        .joinToString(" · ").uppercase(),
                    style = MonoLabel,
                    color = MavrosColors.Foreground.copy(alpha = 0.85f),
                )
                series.synopsis?.let { Text(it, color = MavrosColors.Foreground, maxLines = 3, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyLarge) }
                Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    detail.next?.let { next ->
                        Button(onClick = { onPlay(next.episode, next.startAt) }, modifier = Modifier.focusRequester(play).testTag("tv-play")) {
                            Text(next.label, fontWeight = FontWeight.SemiBold)
                        }
                    }
                    // "Agregar a lista" (PL-07)
                    extra()
                }
            }
            Spacer(Modifier.weight(1f))
            if (detail.seasons.size > 1) {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp), contentPadding = PaddingValues(end = 64.dp), modifier = Modifier.testTag("tv-seasons")) {
                    items(detail.seasons) { s ->
                        FilterChip(selected = s == season, onClick = { onSelectSeason(s) }, modifier = Modifier.testTag("tv-season-$s")) { Text(seasonName(s)) }
                    }
                }
            } else {
                season?.let { Text(seasonName(it), style = MaterialTheme.typography.titleMedium, color = MavrosColors.Foreground) }
            }
            // Episodios en fila de tarjetas 16:9 (SER-18)
            LazyRow(horizontalArrangement = Arrangement.spacedBy(20.dp), contentPadding = PaddingValues(end = 64.dp, top = 8.dp, bottom = 8.dp), modifier = Modifier.testTag("tv-episodes")) {
                items(shown, key = { it.id }) { episode ->
                    val position = detail.progress[episode.id]
                    TvEpisodeCard(episode, position, isNext = detail.next?.episode?.id == episode.id) {
                        onPlay(episode, ProgressRules.resumePosition(position, episode.durationSeconds))
                    }
                }
            }
        }
    }
}

@Composable
private fun TvEpisodeCard(episode: Movie, position: Double?, isNext: Boolean, onClick: () -> Unit) {
    val inProgress = position != null && ProgressRules.isInProgress(position, episode.durationSeconds)
    val shape = RoundedCornerShape(12.dp)
    Column(Modifier.width(300.dp)) {
        Card(
            onClick = onClick,
            shape = CardDefaults.shape(shape),
            scale = CardDefaults.scale(focusedScale = 1.06f),
            border = CardDefaults.border(
                border = if (isNext) Border(BorderStroke(2.dp, MavrosColors.Accent.copy(alpha = 0.6f)), shape = shape) else Border.None,
                focusedBorder = Border(BorderStroke(3.dp, MavrosColors.Accent), shape = shape),
            ),
            colors = CardDefaults.colors(containerColor = MavrosColors.Card),
            modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f).testTag("tv-episode-${episode.id}"),
        ) {
            Box(Modifier.fillMaxSize()) {
                PosterImage(episode, Modifier.fillMaxSize()) {
                    Text(episode.title, color = MavrosColors.MutedForeground, modifier = Modifier.align(Alignment.Center).padding(12.dp), maxLines = 2)
                }
                if (inProgress) {
                    Box(Modifier.align(Alignment.BottomStart).fillMaxWidth().height(5.dp).background(MavrosColors.Background.copy(alpha = 0.6f))) {
                        Box(Modifier.fillMaxWidth(ProgressRules.progressRatio(position!!, episode.durationSeconds)).height(5.dp).background(MavrosColors.Accent))
                    }
                }
            }
        }
        Spacer(Modifier.height(14.dp))
        Text("${episode.episodeNumber}. ${episode.title}", color = MavrosColors.Foreground, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyLarge)
        Text(formatDurationShort(episode.durationSeconds), style = MonoLabel, color = MavrosColors.MutedForeground)
        episode.synopsis?.let { Text(it, color = MavrosColors.MutedForeground, maxLines = 2, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodySmall) }
    }
}
