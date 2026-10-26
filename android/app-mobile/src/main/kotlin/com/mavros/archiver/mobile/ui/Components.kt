package com.mavros.archiver.mobile.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material.icons.outlined.Movie
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import com.mavros.archiver.core.data.DataError
import com.mavros.archiver.core.design.MavrosColors
import com.mavros.archiver.core.design.MonoLabel
import com.mavros.archiver.core.model.Movie
import com.mavros.archiver.core.model.formatDurationShort

/** Póster 2:3 con placeholder si no hay imagen y barra de progreso opcional (MOB-07) */
@Composable
fun PosterCard(movie: Movie, onClick: () -> Unit, modifier: Modifier = Modifier, progress: Float? = null) {
    // Sin clip en la tarjeta completa: la esquina redondeada mordía el texto de abajo (solo se redondea el póster)
    Column(
        modifier
            .clickable(onClickLabel = "Ver ${movie.title}", onClick = onClick)
            .semantics { contentDescription = "Ver ${movie.title}" }
            .testTag("poster-${movie.id}"),
    ) {
        Box(
            Modifier
                .fillMaxWidth()
                .aspectRatio(2f / 3f)
                .clip(RoundedCornerShape(12.dp))
                .background(MavrosColors.Card)
                .border(1.dp, MavrosColors.Border, RoundedCornerShape(12.dp)),
        ) {
            if (movie.posterUrl != null) {
                AsyncImage(model = movie.posterUrl, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
            } else {
                Column(Modifier.fillMaxSize().padding(12.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Outlined.Movie, contentDescription = null, tint = MavrosColors.MutedForeground)
                    Spacer(Modifier.height(8.dp))
                    Text(movie.title, style = MaterialTheme.typography.labelLarge, textAlign = TextAlign.Center, maxLines = 3, overflow = TextOverflow.Ellipsis)
                }
            }
            if (progress != null) {
                Box(
                    Modifier
                        .align(Alignment.BottomStart)
                        .fillMaxWidth()
                        .height(4.dp)
                        .background(MavrosColors.Background.copy(alpha = 0.6f))
                        .semantics { progressBarRangeInfo = ProgressBarRangeInfo(progress, 0f..1f) }
                        .testTag("progress-${movie.id}"),
                ) {
                    Box(Modifier.fillMaxWidth(progress).height(4.dp).background(MavrosColors.Accent))
                }
            }
        }
        Spacer(Modifier.height(6.dp))
        Text(movie.title, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium), maxLines = 2, overflow = TextOverflow.Ellipsis)
        // Compacto para tarjetas angostas: "2026 · 1h 39m" cabe en 120 dp sin cortar la duración
        Text(
            listOfNotNull(movie.releaseYear?.toString(), formatDurationShort(movie.durationSeconds)).joinToString(" · "),
            style = MonoLabel.copy(letterSpacing = 0.sp),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.testTag("meta-${movie.id}"),
        )
    }
}

@Composable
fun LoadingState(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxSize().testTag("loading"), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = MavrosColors.Accent)
    }
}

/** Error con "Reintentar" (MOB-09): nunca se queda cargando para siempre */
@Composable
fun ErrorState(error: DataError, onRetry: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier.fillMaxSize().padding(32.dp).testTag("error"),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(Icons.Outlined.CloudOff, contentDescription = null, tint = MavrosColors.MutedForeground, modifier = Modifier.size(40.dp))
        Spacer(Modifier.height(16.dp))
        Text(
            when (error) {
                DataError.Network -> "Sin conexión. Revisa tu internet."
                DataError.Unauthorized -> "Tu sesión ya no es válida."
                DataError.Server -> "Algo salió mal. Intenta de nuevo en un momento."
            },
            textAlign = TextAlign.Center,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(16.dp))
        Button(onClick = onRetry, shape = RoundedCornerShape(999.dp)) { Text("Reintentar") }
    }
}
