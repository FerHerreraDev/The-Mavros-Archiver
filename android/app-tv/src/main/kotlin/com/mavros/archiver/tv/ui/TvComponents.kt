package com.mavros.archiver.tv.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.tv.material3.Border
import androidx.tv.material3.Card
import androidx.tv.material3.CardDefaults
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.mavros.archiver.core.design.DelayedReveal
import com.mavros.archiver.core.design.MavrosColors
import com.mavros.archiver.core.design.MonoLabel
import com.mavros.archiver.core.design.PosterImage
import com.mavros.archiver.core.design.ShimmerHost
import com.mavros.archiver.core.design.skeleton
import com.mavros.archiver.core.model.HasPoster
import com.mavros.archiver.core.model.Movie
import com.mavros.archiver.core.model.formatDurationShort

val TvCardWidth = 168.dp
private val PosterShape = RoundedCornerShape(12.dp)

/**
 * Póster enfocable con el control (TV-04): al enfocarse crece 10 % y se le pone borde rojo.
 * Debajo, título y año · duración.
 */
@Composable
fun TvPosterCard(movie: Movie, onClick: () -> Unit, modifier: Modifier = Modifier, progress: Float? = null) =
    TvPosterCard(movie, movie.title, listOfNotNull(movie.releaseYear?.toString(), formatDurationShort(movie.durationSeconds)).joinToString(" · "), onClick, modifier, progress)

/** Póster de película, serie o episodio (SER-15) con título y una línea de datos */
@Composable
fun TvPosterCard(
    poster: HasPoster,
    title: String,
    meta: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    progress: Float? = null,
    /** Lo que abre la tarjeta (un episodio lleva el póster de su serie pero abre el episodio) */
    tagId: String = poster.id,
) {
    Column(modifier.width(TvCardWidth)) {
        Card(
            onClick = onClick,
            shape = CardDefaults.shape(PosterShape),
            scale = CardDefaults.scale(focusedScale = 1.1f),
            border = CardDefaults.border(focusedBorder = Border(BorderStroke(3.dp, MavrosColors.Accent), shape = PosterShape)),
            colors = CardDefaults.colors(containerColor = MavrosColors.Card),
            modifier = Modifier.fillMaxWidth().aspectRatio(2f / 3f).testTag("tv-card-$tagId"),
        ) {
            Box(Modifier.fillMaxSize()) {
                PosterImage(poster, Modifier.fillMaxSize()) {
                    Box(Modifier.fillMaxSize().padding(12.dp), contentAlignment = Alignment.Center) {
                        Text(title, textAlign = TextAlign.Center, color = MavrosColors.Foreground, maxLines = 4)
                    }
                }
                if (progress != null) {
                    Box(
                        Modifier.align(Alignment.BottomStart).fillMaxWidth().height(5.dp).background(MavrosColors.Background.copy(alpha = 0.6f))
                            .semantics { progressBarRangeInfo = ProgressBarRangeInfo(progress, 0f..1f) }
                            .testTag("tv-progress-$tagId"),
                    ) {
                        Box(Modifier.fillMaxWidth(progress).height(5.dp).background(MavrosColors.Accent))
                    }
                }
            }
        }
        // El póster enfocado crece 10 % (≈12 dp hacia abajo): el título no debe quedar tapado
        Spacer(Modifier.height(20.dp))
        Column(Modifier.testTag("tv-card-text-$tagId")) {
            Text(title, color = MavrosColors.Foreground, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyMedium)
            Text(meta, style = MonoLabel, color = MavrosColors.MutedForeground, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

/** Skeleton del catálogo de la tele: filas de pósters con shimmer, tras 200 ms (LOAD-01) */
@Composable
fun TvCatalogSkeleton(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxSize().testTag("loading")) {
        DelayedReveal {
            ShimmerHost(Modifier.fillMaxSize().padding(start = 48.dp, top = 120.dp).testTag("skeleton")) {
                Column(verticalArrangement = Arrangement.spacedBy(40.dp)) {
                    repeat(2) {
                        Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                            Box(Modifier.width(220.dp).height(28.dp).skeleton())
                            Row(horizontalArrangement = Arrangement.spacedBy(24.dp)) {
                                repeat(7) { Box(Modifier.width(TvCardWidth).aspectRatio(2f / 3f).skeleton(PosterShape)) }
                            }
                        }
                    }
                }
            }
        }
    }
}
