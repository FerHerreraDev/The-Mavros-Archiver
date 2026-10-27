package com.mavros.archiver.tv.player

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Forward10
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Replay10
import androidx.compose.material.icons.outlined.HighQuality
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.tv.material3.Button
import androidx.tv.material3.Icon
import androidx.tv.material3.IconButton
import androidx.tv.material3.ListItem
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.OutlinedButton
import androidx.tv.material3.Text
import com.mavros.archiver.core.android.player.NEXT_EPISODE_COUNTDOWN_SECONDS
import com.mavros.archiver.core.design.MavrosColors
import com.mavros.archiver.core.android.player.UpNext
import com.mavros.archiver.core.model.formatTimestamp
import kotlinx.coroutines.delay

const val AUTO_HIDE_MS = 5_000L

/**
 * Controles del reproductor de la tele (TV-06). Visibles: las flechas se mueven entre los botones
 * y OK activa el enfocado (la actividad les pasa las teclas sin interpretarlas). Ocultos: no hay
 * nada enfocable y la actividad decide (mostrar, adelantar, atrasar, salir).
 */
@Composable
fun TvPlayerControls(
    visible: Boolean,
    title: String,
    isPlaying: Boolean,
    positionMs: Long,
    durationMs: Long,
    qualities: List<Pair<Int?, String>>,
    selectedQuality: Int?,
    onTogglePlay: () -> Unit,
    onSeekBack: () -> Unit,
    onSeekForward: () -> Unit,
    onSelectQuality: (Int?) -> Unit,
    /** Cambia con cada tecla de la actividad: reinicia el temporizador */
    interaction: Int,
    onAutoHide: () -> Unit,
) {
    var picking by remember { mutableStateOf(false) }

    // Se ocultan solos tras 5 s sin tocar nada mientras reproduce; con la lista de calidades abierta, no
    LaunchedEffect(visible, interaction, isPlaying, picking) {
        if (visible && isPlaying && !picking) {
            delay(AUTO_HIDE_MS)
            onAutoHide()
        }
    }
    val playFocus = remember { FocusRequester() }

    AnimatedVisibility(visible, enter = fadeIn(), exit = fadeOut()) {
        // Al aparecer, el foco va a ⏯ (se reintenta hasta que el botón exista)
        LaunchedEffect(Unit) {
            repeat(30) {
                withFrameNanos { }
                if (runCatching { playFocus.requestFocus() }.isSuccess) return@LaunchedEffect
            }
        }
        Box(Modifier.fillMaxSize()) {
            Text(
                title,
                style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
                color = MavrosColors.Foreground,
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Brush.verticalGradient(listOf(Color.Black.copy(alpha = 0.75f), Color.Transparent)))
                    .padding(horizontal = 48.dp, vertical = 32.dp),
            )
            Column(
                Modifier
                    .align(Alignment.BottomStart)
                    .fillMaxWidth()
                    .background(Brush.verticalGradient(listOf(Color.Transparent, Color.Black.copy(alpha = 0.85f))))
                    .padding(horizontal = 48.dp, vertical = 32.dp),
            ) {
                ProgressLine(positionMs, durationMs)
                Spacer(Modifier.height(20.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = onSeekBack, modifier = Modifier.testTag("tv-back10")) {
                        Icon(Icons.Filled.Replay10, contentDescription = "Atrasar 10 segundos")
                    }
                    IconButton(onClick = onTogglePlay, modifier = Modifier.focusRequester(playFocus).testTag("tv-play-pause")) {
                        Icon(if (isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow, contentDescription = if (isPlaying) "Pausar" else "Reproducir")
                    }
                    IconButton(onClick = onSeekForward, modifier = Modifier.testTag("tv-forward")) {
                        Icon(Icons.Filled.Forward10, contentDescription = "Adelantar 10 segundos")
                    }
                    Spacer(Modifier.width(8.dp))
                    if (qualities.size > 1) {
                        IconButton(onClick = { picking = true }, modifier = Modifier.testTag("tv-quality")) {
                            Icon(Icons.Outlined.HighQuality, contentDescription = "Calidad")
                        }
                        Text(
                            qualities.firstOrNull { it.first == selectedQuality }?.second ?: "Automática",
                            color = MavrosColors.MutedForeground,
                        )
                    }
                }
            }
        }
    }

    if (picking) QualityDialog(qualities, selectedQuality, onDismiss = { picking = false }) {
        onSelectQuality(it)
        picking = false
    }
}

@Composable
private fun ProgressLine(positionMs: Long, durationMs: Long) {
    val ratio = if (durationMs > 0) (positionMs.toFloat() / durationMs).coerceIn(0f, 1f) else 0f
    Column {
        Box(Modifier.fillMaxWidth().height(6.dp).background(Color.White.copy(alpha = 0.25f))) {
            Box(Modifier.fillMaxWidth(ratio).height(6.dp).background(MavrosColors.Accent))
        }
        Spacer(Modifier.height(10.dp))
        Text(
            "${formatTimestamp(positionMs / 1000.0)} / ${formatTimestamp(durationMs / 1000.0)}",
            color = MavrosColors.Foreground,
            style = MaterialTheme.typography.bodyLarge,
        )
    }
}

/** Lista de calidades enfocable con el control; el foco empieza en la elegida */
@Composable
private fun QualityDialog(qualities: List<Pair<Int?, String>>, selected: Int?, onDismiss: () -> Unit, onSelect: (Int?) -> Unit) {
    val first = remember { FocusRequester() }
    Dialog(onDismissRequest = onDismiss) {
        Column(Modifier.background(MavrosColors.Card).padding(24.dp).width(360.dp)) {
            Text("Calidad", style = MaterialTheme.typography.titleLarge, color = MavrosColors.Foreground)
            Spacer(Modifier.height(12.dp))
            qualities.forEachIndexed { index, (height, label) ->
                val focus = if (index == 0) Modifier.focusRequester(first) else Modifier
                ListItem(
                    selected = height == selected,
                    onClick = { onSelect(height) },
                    headlineContent = { Text(label) },
                    modifier = focus.testTag("tv-quality-$label"),
                )
            }
        }
        LaunchedEffect(Unit) {
            repeat(30) {
                withFrameNanos { }
                if (runCatching { first.requestFocus() }.isSuccess) return@LaunchedEffect
            }
        }
    }
}

/** "Siguiente episodio en 10 s" (o "Siguiente en la lista") con "Ver ahora" enfocado y "Cancelar" (SER-16, PL-07) */
@Composable
fun TvNextEpisode(next: UpNext, onPlay: (UpNext) -> Unit, onCancel: () -> Unit, modifier: Modifier = Modifier) {
    var left by remember(next.movie.id) { mutableIntStateOf(NEXT_EPISODE_COUNTDOWN_SECONDS) }
    val now = remember { FocusRequester() }
    LaunchedEffect(next.movie.id) {
        runCatching { now.requestFocus() }
        while (left > 0) {
            delay(1_000)
            left--
        }
        onPlay(next)
    }
    Column(
        modifier
            .padding(48.dp)
            .width(420.dp)
            .background(Color.Black.copy(alpha = 0.85f), RoundedCornerShape(16.dp))
            .padding(24.dp)
            .testTag("tv-next-episode"),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text("${next.heading} en $left s", color = MavrosColors.MutedForeground, style = MaterialTheme.typography.titleSmall, modifier = Modifier.testTag("tv-next-countdown"))
        Text(next.movie.episodeTag?.let { "$it · ${next.movie.title}" } ?: next.movie.title, color = MavrosColors.Foreground, style = MaterialTheme.typography.titleLarge, maxLines = 2)
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Button(onClick = { onPlay(next) }, modifier = Modifier.focusRequester(now).testTag("tv-next-now")) { Text("Ver ahora") }
            OutlinedButton(onClick = onCancel, modifier = Modifier.testTag("tv-next-cancel")) { Text("Cancelar") }
        }
    }
}
