package com.mavros.archiver.mobile.series

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.outlined.Movie
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.draw.blur
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mavros.archiver.core.android.series.SeriesUiState
import com.mavros.archiver.core.android.series.SeriesViewModel
import com.mavros.archiver.core.design.MavrosColors
import com.mavros.archiver.core.design.MonoLabel
import com.mavros.archiver.core.design.PosterImage
import com.mavros.archiver.core.model.CatalogSeries
import com.mavros.archiver.core.model.Movie
import com.mavros.archiver.core.model.ProgressRules
import com.mavros.archiver.core.model.SeriesDetail
import com.mavros.archiver.core.model.formatDurationShort
import com.mavros.archiver.core.model.seasonName
import com.mavros.archiver.mobile.ui.DetailSkeleton
import com.mavros.archiver.mobile.ui.ErrorState

@Composable
fun SeriesScreen(viewModel: SeriesViewModel, onBack: () -> Unit, onPlay: (movie: Movie, startAt: Double) -> Unit, extra: @Composable () -> Unit = {}) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    SeriesContent(state, onBack, onPlay, viewModel::selectSeason, viewModel::retry, extra)
}

/** Página de la serie (SER-09, SER-10, SER-15) */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SeriesContent(
    state: SeriesUiState,
    onBack: () -> Unit,
    onPlay: (Movie, Double) -> Unit,
    onSelectSeason: (Int) -> Unit,
    onRetry: () -> Unit,
    extra: @Composable () -> Unit = {},
) {
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = {},
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Volver") } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
    ) { padding ->
        when (state) {
            SeriesUiState.Loading -> DetailSkeleton(Modifier.padding(padding))
            is SeriesUiState.Error -> ErrorState(state.error, onRetry, Modifier.padding(padding))
            SeriesUiState.NotAvailable -> Box(Modifier.fillMaxSize().padding(padding).testTag("not-available"), contentAlignment = Alignment.Center) {
                Text("Esta serie no está disponible.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            is SeriesUiState.Content -> SeriesBody(state.detail, state.season, Modifier.padding(padding), onPlay, onSelectSeason, extra)
        }
    }
}

@Composable
private fun SeriesBody(detail: SeriesDetail, season: Int?, modifier: Modifier, onPlay: (Movie, Double) -> Unit, onSelectSeason: (Int) -> Unit, extra: @Composable () -> Unit) {
    val series = detail.series
    val shown = detail.episodes.filter { it.seasonNumber == season }
    LazyColumn(
        modifier.fillMaxSize().testTag("series"),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 32.dp),
    ) {
        // Portada: imagen horizontal (o el póster) de fondo con el título encima (SER-17)
        item {
            val background = series.background
            Box(Modifier.fillMaxWidth().aspectRatio(16f / 10f).testTag("hero")) {
                PosterImage(background, Modifier.fillMaxSize().then(if (background.isWide) Modifier else Modifier.blur(24.dp))) {}
                Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0.3f to Color.Transparent, 1f to MavrosColors.Background)))
                Column(Modifier.align(Alignment.BottomStart).padding(horizontal = 20.dp, vertical = 12.dp)) {
                    Text(series.title, style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.Bold), modifier = Modifier.testTag("title"))
                    series.originalTitle?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
            }
        }
        item {
            Column(Modifier.padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                val count = CatalogSeries(series, detail.seasons.size, detail.episodes.size).countLabel
                Text(
                    (listOfNotNull(series.releaseYear?.toString(), count) + series.genres).joinToString(" · ").uppercase(),
                    style = MonoLabel,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.testTag("meta"),
                )
                detail.next?.let { next ->
                    Button(
                        onClick = { onPlay(next.episode, next.startAt) },
                        shape = RoundedCornerShape(999.dp),
                        modifier = Modifier.fillMaxWidth().height(52.dp).testTag("play"),
                    ) {
                        Icon(Icons.Filled.PlayArrow, contentDescription = null)
                        Spacer(Modifier.width(8.dp))
                        Text(next.label, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
                // "Agregar a lista" (PL-07)
                extra()
                series.synopsis?.let { Text(it, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.testTag("synopsis")) }
            }
        }

        item {
            Text(
                "Episodios",
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.padding(start = 20.dp, end = 20.dp, top = 8.dp).semantics { heading() },
            )
        }
        if (detail.seasons.size > 1) {
            item {
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 20.dp),
                    modifier = Modifier.testTag("seasons"),
                ) {
                    items(detail.seasons) { s ->
                        FilterChip(
                            selected = s == season,
                            onClick = { onSelectSeason(s) },
                            label = { Text(seasonName(s)) },
                            colors = FilterChipDefaults.filterChipColors(selectedContainerColor = MavrosColors.Accent.copy(alpha = 0.18f)),
                            border = FilterChipDefaults.filterChipBorder(enabled = true, selected = s == season, borderColor = MavrosColors.Border, selectedBorderColor = MavrosColors.Accent),
                        )
                    }
                }
            }
        }
        if (shown.isEmpty()) {
            item { Text("Esta serie todavía no tiene episodios.", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(horizontal = 20.dp)) }
        }
        items(shown, key = { it.id }) { episode ->
            val position = detail.progress[episode.id]
            EpisodeRow(episode, position, isNext = detail.next?.episode?.id == episode.id) {
                onPlay(episode, ProgressRules.resumePosition(position, episode.durationSeconds))
            }
        }
    }
}

/** Episodio con imagen 16:9, progreso, título, duración y sinopsis; el que sigue, resaltado (SER-18) */
@Composable
private fun EpisodeRow(episode: Movie, position: Double?, isNext: Boolean, onClick: () -> Unit) {
    val inProgress = position != null && ProgressRules.isInProgress(position, episode.durationSeconds)
    val shape = RoundedCornerShape(12.dp)
    Column(
        Modifier.padding(horizontal = 20.dp).fillMaxWidth().clip(shape)
            .background(if (isNext) MavrosColors.Accent.copy(alpha = 0.08f) else MavrosColors.Card)
            .then(if (isNext) Modifier.border(1.dp, MavrosColors.Accent.copy(alpha = 0.6f), shape) else Modifier)
            .clickable(onClickLabel = "Ver ${episode.episodeTag} ${episode.title}", onClick = onClick)
            .semantics { contentDescription = "Ver ${episode.episodeTag} ${episode.title}" }
            .padding(10.dp)
            .testTag("episode-${episode.id}"),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.width(140.dp).aspectRatio(16f / 9f).clip(RoundedCornerShape(8.dp)).background(MavrosColors.Background)) {
                PosterImage(episode, Modifier.fillMaxSize()) {
                    Icon(Icons.Outlined.Movie, contentDescription = null, tint = MavrosColors.MutedForeground, modifier = Modifier.align(Alignment.Center))
                }
                if (inProgress) {
                    Box(Modifier.align(Alignment.BottomStart).fillMaxWidth().height(3.dp).background(MavrosColors.Background.copy(alpha = 0.6f)).testTag("progress-${episode.id}")) {
                        Box(Modifier.fillMaxWidth(ProgressRules.progressRatio(position!!, episode.durationSeconds)).height(3.dp).background(MavrosColors.Accent))
                    }
                }
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("${episode.episodeNumber}. ${episode.title}", style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium), maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(formatDurationShort(episode.durationSeconds), style = MonoLabel, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        episode.synopsis?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.testTag("synopsis-${episode.id}"))
        }
    }
}
