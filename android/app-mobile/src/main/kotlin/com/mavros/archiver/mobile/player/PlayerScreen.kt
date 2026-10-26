package com.mavros.archiver.mobile.player

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
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.HighQuality
import androidx.compose.material.icons.outlined.VideocamOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.mavros.archiver.core.data.DataError
import com.mavros.archiver.core.design.MavrosColors
import com.mavros.archiver.core.design.MavrosLoader

/**
 * Pantalla del reproductor (MOB-13, MOB-14). [video] es la superficie de Media3 (PlayerView);
 * todo lo demás se dibuja encima y se prueba sin reproductor real.
 */
@Composable
fun PlayerScreen(
    state: PlayerUiState,
    title: String,
    inPip: Boolean,
    controlsVisible: Boolean,
    buffering: Boolean,
    playbackFailed: Boolean,
    qualities: List<Pair<Int?, String>>,
    selectedQuality: Int?,
    onSelectQuality: (Int?) -> Unit,
    onBack: () -> Unit,
    onRetry: () -> Unit,
    video: @Composable () -> Unit,
) {
    Box(Modifier.fillMaxSize().background(Color.Black)) {
        when (state) {
            PlayerUiState.Loading -> PlayerLoader("Preparando video", Modifier.align(Alignment.Center))
            PlayerUiState.NotAvailable -> PlayerMessage("Esta película no está disponible.", onRetry = null, onBack = onBack)
            is PlayerUiState.Error -> PlayerMessage(errorText(state.error), onRetry = onRetry, onBack = onBack)
            is PlayerUiState.Ready -> {
                video()
                if (playbackFailed) {
                    PlayerMessage("No se pudo reproducir el video. Revisa tu conexión.", onRetry = onRetry, onBack = onBack)
                } else if (buffering && !inPip) {
                    PlayerLoader("Cargando", Modifier.align(Alignment.Center))
                }
            }
        }

        // Barra de arriba: atrás, título y calidad. Se esconde con los controles y en PiP.
        AnimatedVisibility(
            visible = !inPip && (controlsVisible || state !is PlayerUiState.Ready),
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier.align(Alignment.TopStart),
        ) {
            TopBar(title, state is PlayerUiState.Ready && qualities.size > 1, qualities, selectedQuality, onSelectQuality, onBack)
        }
    }
}

@Composable
private fun TopBar(
    title: String,
    showQuality: Boolean,
    qualities: List<Pair<Int?, String>>,
    selected: Int?,
    onSelect: (Int?) -> Unit,
    onBack: () -> Unit,
) {
    var picking by remember { mutableStateOf(false) }
    Row(
        Modifier
            .fillMaxWidth()
            .background(Brush.verticalGradient(listOf(Color.Black.copy(alpha = 0.7f), Color.Transparent)))
            .safeDrawingPadding()
            .padding(horizontal = 8.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Volver", tint = Color.White) }
        Text(
            title,
            color = Color.White,
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f).testTag("player-title"),
        )
        if (showQuality) {
            IconButton(onClick = { picking = true }, modifier = Modifier.testTag("quality")) {
                Icon(Icons.Outlined.HighQuality, contentDescription = "Calidad", tint = Color.White)
            }
        }
    }
    if (picking) {
        AlertDialog(
            onDismissRequest = { picking = false },
            title = { Text("Calidad") },
            text = {
                Column {
                    qualities.forEach { (height, label) ->
                        TextButton(onClick = { onSelect(height); picking = false }, modifier = Modifier.fillMaxWidth().testTag("quality-$label")) {
                            Text(label, modifier = Modifier.weight(1f), textAlign = TextAlign.Start)
                            if (height == selected) Icon(Icons.Outlined.Check, contentDescription = "Elegida")
                        }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { picking = false }) { Text("Cerrar") } },
        )
    }
}

/** Loader nativo de la marca (core:design) mientras prepara o carga el video */
@Composable
fun PlayerLoader(label: String, modifier: Modifier = Modifier) {
    Column(modifier.testTag("player-loading").semantics { contentDescription = label }, horizontalAlignment = Alignment.CenterHorizontally) {
        MavrosLoader(size = 64.dp)
    }
}

@Composable
private fun PlayerMessage(text: String, onRetry: (() -> Unit)?, onBack: () -> Unit) {
    Column(
        Modifier.fillMaxSize().padding(32.dp).testTag("player-message"),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(Icons.Outlined.VideocamOff, contentDescription = null, tint = MavrosColors.MutedForeground, modifier = Modifier.size(40.dp))
        Spacer(Modifier.height(16.dp))
        Text(text, color = MavrosColors.Foreground, textAlign = TextAlign.Center)
        Spacer(Modifier.height(16.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            TextButton(onClick = onBack) { Text("Volver") }
            if (onRetry != null) {
                Spacer(Modifier.width(4.dp))
                Button(onClick = onRetry, shape = RoundedCornerShape(999.dp)) { Text("Reintentar") }
            }
        }
    }
}

private fun errorText(error: DataError) = when (error) {
    DataError.Network -> "Sin conexión. Revisa tu internet."
    DataError.Unauthorized -> "Tu sesión ya no es válida."
    DataError.Server -> "Algo salió mal. Intenta de nuevo en un momento."
}
