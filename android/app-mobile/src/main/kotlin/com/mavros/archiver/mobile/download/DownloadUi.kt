package com.mavros.archiver.mobile.download

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Delete
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material.icons.outlined.DownloadDone
import androidx.compose.material.icons.outlined.ErrorOutline
import androidx.compose.material.icons.outlined.Movie
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.mavros.archiver.core.android.download.DownloadStartException
import com.mavros.archiver.core.android.download.OfflineItem
import com.mavros.archiver.core.android.download.OfflineMovie
import com.mavros.archiver.core.android.download.OfflineState
import com.mavros.archiver.core.data.DataError
import com.mavros.archiver.core.design.MavrosColors
import com.mavros.archiver.core.design.MonoLabel
import com.mavros.archiver.core.design.PosterImage
import com.mavros.archiver.core.model.HasPoster
import com.mavros.archiver.core.model.formatDurationShort
import kotlinx.coroutines.launch

private fun startErrorText(error: DataError?) = when (error) {
    DataError.Network -> "Sin conexión: no se pudo empezar la descarga."
    null -> "Esta película ya no se puede descargar."
    else -> "No se pudo empezar la descarga."
}

/** Pide permiso de notificaciones la primera vez (Android 13+): ahí se ve el avance (DL-01) */
@Composable
private fun rememberStart(onStart: suspend () -> Unit, onError: (String) -> Unit): () -> Unit {
    val scope = rememberCoroutineScope()
    val run: () -> Unit = {
        scope.launch {
            try {
                onStart()
            } catch (e: DownloadStartException) {
                onError(startErrorText(e.error))
            }
        }
    }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { run() }
    return {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) permission.launch(Manifest.permission.POST_NOTIFICATIONS) else run()
    }
}

/** "Descargar" en el detalle (DL-01): avance y cancelar mientras baja; borrar cuando ya está */
@Composable
fun DownloadButton(item: OfflineItem?, onStart: suspend () -> Unit, onRemove: () -> Unit, modifier: Modifier = Modifier) {
    var error by remember { mutableStateOf<String?>(null) }
    val start = rememberStart(onStart) { error = it }
    Column(modifier.fillMaxWidth()) {
        when (item?.state) {
            null, OfflineState.Failed -> OutlinedButton(onClick = { error = null; start() }, shape = RoundedCornerShape(999.dp), modifier = Modifier.fillMaxWidth().testTag("download")) {
                Icon(if (item == null) Icons.Outlined.Download else Icons.Outlined.ErrorOutline, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text(if (item == null) "Descargar" else "No se pudo descargar · Reintentar")
            }
            OfflineState.Preparing, OfflineState.Queued, OfflineState.Downloading -> Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(999.dp)).background(MavrosColors.Card).padding(start = 16.dp).testTag("download-progress"),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = MavrosColors.Accent)
                Spacer(Modifier.width(12.dp))
                Text(progressText(item), modifier = Modifier.weight(1f))
                IconButton(onClick = onRemove, modifier = Modifier.testTag("download-cancel")) { Icon(Icons.Outlined.Close, contentDescription = "Cancelar descarga") }
            }
            OfflineState.Completed -> Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(999.dp)).background(MavrosColors.Card).padding(start = 16.dp).testTag("download-done"),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Outlined.DownloadDone, contentDescription = null, tint = MavrosColors.Accent)
                Spacer(Modifier.width(12.dp))
                Text("Descargada · ${sizeText(item.bytes)}", modifier = Modifier.weight(1f))
                IconButton(onClick = onRemove, modifier = Modifier.testTag("download-remove")) { Icon(Icons.Outlined.Delete, contentDescription = "Borrar descarga") }
            }
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 6.dp).testTag("download-error")) }
    }
}

/** Ícono de descarga de cada episodio (DL-01) */
@Composable
fun EpisodeDownloadIcon(item: OfflineItem?, title: String, onStart: suspend () -> Unit, onRemove: () -> Unit) {
    val start = rememberStart(onStart) { }
    when (item?.state) {
        null, OfflineState.Failed -> IconButton(onClick = start, modifier = Modifier.testTag("download-icon")) {
            Icon(Icons.Outlined.Download, contentDescription = "Descargar $title")
        }
        OfflineState.Completed -> IconButton(onClick = onRemove, modifier = Modifier.testTag("download-icon-done")) {
            Icon(Icons.Outlined.DownloadDone, contentDescription = "Borrar descarga de $title", tint = MavrosColors.Accent)
        }
        else -> IconButton(onClick = onRemove, modifier = Modifier.testTag("download-icon-progress")) {
            Box(contentAlignment = Alignment.Center) {
                val percent = item.percent
                if (percent != null) CircularProgressIndicator(progress = { percent }, Modifier.size(24.dp), strokeWidth = 2.dp, color = MavrosColors.Accent)
                else CircularProgressIndicator(Modifier.size(24.dp), strokeWidth = 2.dp, color = MavrosColors.Accent)
                Icon(Icons.Outlined.Close, contentDescription = "Cancelar descarga de $title", modifier = Modifier.size(12.dp))
            }
        }
    }
}

fun progressText(item: OfflineItem) = when (item.state) {
    OfflineState.Preparing -> "Preparando…"
    OfflineState.Queued -> "En espera…"
    else -> item.percent?.let { "Descargando… ${(it * 100).toInt()} %" } ?: "Descargando…"
}

fun sizeText(bytes: Long): String = when {
    bytes >= 1_000_000_000 -> "%.1f GB".format(bytes / 1e9)
    bytes >= 1_000_000 -> "${bytes / 1_000_000} MB"
    else -> "${bytes / 1_000} KB"
}

private class OfflinePoster(private val movie: OfflineMovie) : HasPoster {
    override val id get() = movie.id
    override val title get() = movie.title
    override val posterSrc get() = movie.posterSrc
    override val posterThumbhash: String? get() = null
}

/** DL-03: lo descargado, para ver sin internet */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DownloadsScreen(items: List<OfflineItem>, onBack: () -> Unit, onPlay: (OfflineMovie) -> Unit, onRemove: (String) -> Unit) {
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = { Text("Descargas") },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Volver") } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
    ) { padding ->
        if (items.isEmpty()) {
            Column(Modifier.fillMaxSize().padding(padding).padding(32.dp).testTag("downloads-empty"), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                Icon(Icons.Outlined.Download, contentDescription = null, tint = MavrosColors.MutedForeground)
                Spacer(Modifier.height(8.dp))
                Text("No tienes descargas. Usa Descargar en una película o episodio para verla sin internet.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            return@Scaffold
        }
        LazyColumn(Modifier.fillMaxSize().testTag("downloads"), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = padding.calculateTopPadding() + 8.dp, bottom = 32.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            items(items, key = { it.movie.id }) { item ->
                val done = item.state == OfflineState.Completed
                Row(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(MavrosColors.Card)
                        .then(if (done) Modifier.clickable(onClickLabel = "Ver ${item.movie.title}") { onPlay(item.movie) } else Modifier)
                        .semantics { contentDescription = "Ver ${item.movie.title}" }
                        .padding(10.dp)
                        .testTag("download-${item.movie.id}"),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Box(Modifier.width(56.dp).aspectRatio(2f / 3f).clip(RoundedCornerShape(8.dp)).background(MavrosColors.Background)) {
                        PosterImage(OfflinePoster(item.movie), Modifier.fillMaxSize()) {
                            Icon(Icons.Outlined.Movie, contentDescription = null, tint = MavrosColors.MutedForeground, modifier = Modifier.align(Alignment.Center))
                        }
                    }
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(item.movie.title, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium), maxLines = 2, overflow = TextOverflow.Ellipsis)
                        item.movie.subtitle?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1) }
                        Text(
                            when (item.state) {
                                OfflineState.Completed -> listOf(formatDurationShort(item.movie.durationSeconds), sizeText(item.bytes)).joinToString(" · ")
                                OfflineState.Failed -> "No se pudo descargar"
                                else -> progressText(item)
                            },
                            style = MonoLabel,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.testTag("download-status-${item.movie.id}"),
                        )
                    }
                    IconButton(onClick = { onRemove(item.movie.id) }) { Icon(Icons.Outlined.Delete, contentDescription = "Borrar ${item.movie.title}") }
                }
            }
        }
    }
}
