package com.mavros.archiver.mobile.detail

import com.mavros.archiver.core.android.detail.DetailUiState
import com.mavros.archiver.core.android.detail.DetailViewModel
import com.mavros.archiver.core.android.detail.playLabel

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.outlined.Movie
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.lifecycle.compose.LifecycleResumeEffect
import com.mavros.archiver.core.model.Movie
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mavros.archiver.core.design.MavrosColors
import com.mavros.archiver.core.design.PosterImage
import com.mavros.archiver.core.design.MonoLabel
import com.mavros.archiver.core.model.MovieDetail
import com.mavros.archiver.core.model.ProgressRules
import com.mavros.archiver.core.model.formatDuration
import com.mavros.archiver.mobile.ui.ErrorState
import com.mavros.archiver.mobile.ui.DetailSkeleton

@Composable
fun DetailScreen(
    viewModel: DetailViewModel,
    onBack: () -> Unit,
    onPlay: (movie: Movie, startAt: Double) -> Unit,
    extra: @Composable () -> Unit = {},
    onOpenSeries: (String) -> Unit = {},
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    // Al volver del reproductor, el botón muestra el progreso nuevo (MOB-19)
    var resumed by remember { mutableStateOf(false) }
    LifecycleResumeEffect(Unit) {
        if (resumed) viewModel.refresh() else resumed = true
        onPauseOrDispose { }
    }
    DetailContent(state, onBack, { start -> (state as? DetailUiState.Content)?.detail?.movie?.let { onPlay(it, start) } }, viewModel::retry, extra, onOpenSeries)
}


@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DetailContent(
    state: DetailUiState,
    onBack: () -> Unit,
    onPlay: (Double) -> Unit,
    onRetry: () -> Unit,
    extra: @Composable () -> Unit = {},
    onOpenSeries: (String) -> Unit = {},
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
            DetailUiState.Loading -> DetailSkeleton(Modifier.padding(padding))
            is DetailUiState.Error -> ErrorState(state.error, onRetry, Modifier.padding(padding))
            DetailUiState.NotAvailable -> Box(Modifier.fillMaxSize().padding(padding).testTag("not-available"), contentAlignment = Alignment.Center) {
                Text("Esta película no está disponible.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            is DetailUiState.Content -> MovieDetailBody(state.detail, Modifier.padding(padding), onPlay, extra, onOpenSeries)
        }
    }
}

@Composable
private fun MovieDetailBody(detail: MovieDetail, modifier: Modifier, onPlay: (Double) -> Unit, extra: @Composable () -> Unit, onOpenSeries: (String) -> Unit) {
    val movie = detail.movie
    Column(
        modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(bottom = 32.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Box(
                Modifier.width(140.dp).aspectRatio(2f / 3f).clip(RoundedCornerShape(12.dp))
                    .background(MavrosColors.Card).border(1.dp, MavrosColors.Border, RoundedCornerShape(12.dp)),
            ) {
                PosterImage(movie, Modifier.fillMaxSize()) {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Icon(Icons.Outlined.Movie, contentDescription = null, tint = MavrosColors.MutedForeground)
                    }
                }
            }
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                // Episodio: su serie y "T1:E2" (SER-12)
                detail.series?.let {
                    Text("${it.title} · ${movie.episodeTag}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.testTag("series-line"))
                }
                Text(movie.title, style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold), modifier = Modifier.testTag("title"))
                movie.originalTitle?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                Text(
                    (listOfNotNull(movie.releaseYear?.toString(), formatDuration(movie.durationSeconds)) + movie.genres).joinToString(" · ").uppercase(),
                    style = MonoLabel,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.testTag("meta"),
                )
            }
        }

        val start = ProgressRules.resumePosition(detail.positionSeconds, movie.durationSeconds)
        Button(
            onClick = { onPlay(start) },
            shape = RoundedCornerShape(999.dp),
            modifier = Modifier.fillMaxWidth().height(52.dp).testTag("play"),
        ) {
            Icon(Icons.Filled.PlayArrow, contentDescription = null)
            Spacer(Modifier.width(8.dp))
            Text(playLabel(detail), fontWeight = FontWeight.SemiBold)
        }
        // Episodio: a su serie con todos los capítulos (SER-20)
        detail.series?.let { series ->
            OutlinedButton(onClick = { onOpenSeries(series.id) }, shape = RoundedCornerShape(999.dp), modifier = Modifier.fillMaxWidth().testTag("open-series")) {
                Text("Ver episodios")
            }
        }
        // "Agregar a lista" (PL-07)
        extra()

        movie.synopsis?.let { Text(it, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.testTag("synopsis")) }
    }
}
