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
fun TvSeriesScreen(state: SeriesUiState, onPlay: (Movie, Double) -> Unit, onSelectSeason: (Int) -> Unit, onRetry: () -> Unit) {
    Box(Modifier.fillMaxSize().background(MavrosColors.Background)) {
        when (state) {
            SeriesUiState.Loading -> MavrosLoader(Modifier.align(Alignment.Center).testTag("tv-loading"), size = 72.dp)
            is SeriesUiState.Error -> Message(errorText(state.error), onRetry)
            SeriesUiState.NotAvailable -> Message("Esta serie no está disponible.", null)
            is SeriesUiState.Content -> Body(state.detail, state.season, onPlay, onSelectSeason)
        }
    }
}

@OptIn(ExperimentalTvMaterial3Api::class)
@Composable
private fun Body(detail: SeriesDetail, season: Int?, onPlay: (Movie, Double) -> Unit, onSelectSeason: (Int) -> Unit) {
    val series = detail.series
    val play = remember { FocusRequester() }
    // El botón vive en una LazyColumn: se crea después de esta composición, se reintenta cuadro a cuadro
    LaunchedEffect(series.id) {
        repeat(30) {
            withFrameNanos { }
            if (runCatching { play.requestFocus() }.isSuccess) return@LaunchedEffect
        }
    }
    val shown = detail.episodes.filter { it.seasonNumber == season }

    Row(Modifier.fillMaxSize().padding(start = 64.dp, end = 64.dp, top = 48.dp), horizontalArrangement = Arrangement.spacedBy(48.dp)) {
        Box(Modifier.width(260.dp).aspectRatio(2f / 3f).clip(RoundedCornerShape(16.dp)).background(MavrosColors.Card)) {
            PosterImage(series, Modifier.fillMaxSize()) {}
        }
        LazyColumn(
            Modifier.weight(1f).testTag("tv-series"),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            contentPadding = PaddingValues(bottom = 48.dp),
        ) {
            item {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(series.title, style = MaterialTheme.typography.displaySmall.copy(fontWeight = FontWeight.Bold), color = MavrosColors.Foreground, modifier = Modifier.testTag("tv-title"))
                    Text(
                        (listOfNotNull(series.releaseYear?.toString(), CatalogSeries(series, detail.seasons.size, detail.episodes.size).countLabel) + series.genres)
                            .joinToString(" · ").uppercase(),
                        style = MonoLabel,
                        color = MavrosColors.MutedForeground,
                    )
                    detail.next?.let { next ->
                        Button(onClick = { onPlay(next.episode, next.startAt) }, modifier = Modifier.focusRequester(play).testTag("tv-play")) {
                            Text(next.label, fontWeight = FontWeight.SemiBold)
                        }
                    }
                    series.synopsis?.let { Text(it, color = MavrosColors.Foreground, maxLines = 3, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyLarge) }
                }
            }
            if (detail.seasons.size > 1) {
                item {
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp), contentPadding = PaddingValues(vertical = 8.dp), modifier = Modifier.testTag("tv-seasons")) {
                        items(detail.seasons) { s ->
                            FilterChip(selected = s == season, onClick = { onSelectSeason(s) }, modifier = Modifier.testTag("tv-season-$s")) { Text(seasonName(s)) }
                        }
                    }
                }
            }
            items(shown, key = { it.id }) { episode ->
                val position = detail.progress[episode.id]
                val inProgress = position != null && ProgressRules.isInProgress(position, episode.durationSeconds)
                ListItem(
                    selected = false,
                    onClick = { onPlay(episode, ProgressRules.resumePosition(position, episode.durationSeconds)) },
                    leadingContent = { Text("${episode.episodeNumber}", style = MaterialTheme.typography.titleLarge) },
                    headlineContent = { Text(episode.title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                    supportingContent = if (inProgress) {
                        {
                            Box(Modifier.fillMaxWidth().height(4.dp).background(MavrosColors.Border)) {
                                Box(Modifier.fillMaxWidth(ProgressRules.progressRatio(position!!, episode.durationSeconds)).height(4.dp).background(MavrosColors.Accent))
                            }
                        }
                    } else null,
                    trailingContent = { Text(formatDurationShort(episode.durationSeconds), style = MonoLabel) },
                    modifier = Modifier.testTag("tv-episode-${episode.id}"),
                )
            }
        }
    }
}
