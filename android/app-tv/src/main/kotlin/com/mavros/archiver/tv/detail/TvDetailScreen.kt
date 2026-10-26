package com.mavros.archiver.tv.detail

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
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
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.mavros.archiver.core.android.detail.DetailUiState
import com.mavros.archiver.core.android.detail.playLabel
import com.mavros.archiver.core.design.MavrosColors
import com.mavros.archiver.core.design.MavrosLoader
import com.mavros.archiver.core.design.MonoLabel
import com.mavros.archiver.core.design.PosterImage
import com.mavros.archiver.core.model.Movie
import com.mavros.archiver.core.model.MovieDetail
import com.mavros.archiver.core.model.ProgressRules
import com.mavros.archiver.core.model.formatDuration
import com.mavros.archiver.tv.catalog.Message
import com.mavros.archiver.tv.catalog.errorText

/** TV-05: detalle con "Reproducir" / "Continuar desde" enfocado al abrir */
@Composable
fun TvDetailScreen(state: DetailUiState, onPlay: (Movie, Double) -> Unit, onRetry: () -> Unit) {
    Box(Modifier.fillMaxSize().background(MavrosColors.Background)) {
        when (state) {
            DetailUiState.Loading -> MavrosLoader(Modifier.align(Alignment.Center).testTag("tv-loading"), size = 72.dp)
            is DetailUiState.Error -> Message(errorText(state.error), onRetry)
            DetailUiState.NotAvailable -> Message("Esta película no está disponible.", null)
            is DetailUiState.Content -> Body(state.detail, onPlay)
        }
    }
}

@Composable
private fun Body(detail: MovieDetail, onPlay: (Movie, Double) -> Unit) {
    val movie = detail.movie
    val play = remember { FocusRequester() }
    LaunchedEffect(movie.id) { runCatching { play.requestFocus() } }
    Row(Modifier.fillMaxSize().padding(64.dp), horizontalArrangement = Arrangement.spacedBy(48.dp)) {
        Box(Modifier.width(300.dp).aspectRatio(2f / 3f).clip(RoundedCornerShape(16.dp)).background(MavrosColors.Card)) {
            PosterImage(movie, Modifier.fillMaxSize()) {}
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Text(movie.title, style = MaterialTheme.typography.displaySmall.copy(fontWeight = FontWeight.Bold), color = MavrosColors.Foreground, modifier = Modifier.testTag("tv-title"))
            movie.originalTitle?.let { Text(it, color = MavrosColors.MutedForeground) }
            Text(
                (listOfNotNull(movie.releaseYear?.toString(), formatDuration(movie.durationSeconds)) + movie.genres).joinToString(" · ").uppercase(),
                style = MonoLabel,
                color = MavrosColors.MutedForeground,
            )
            Spacer(Modifier.height(8.dp))
            Button(
                onClick = { onPlay(movie, ProgressRules.resumePosition(detail.positionSeconds, movie.durationSeconds)) },
                modifier = Modifier.focusRequester(play).testTag("tv-play"),
            ) { Text(playLabel(detail), fontWeight = FontWeight.SemiBold) }
            Spacer(Modifier.height(8.dp))
            movie.synopsis?.let { Text(it, color = MavrosColors.Foreground, maxLines = 8, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyLarge) }
        }
    }
}
