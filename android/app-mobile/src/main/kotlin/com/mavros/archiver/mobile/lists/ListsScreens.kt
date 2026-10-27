package com.mavros.archiver.mobile.lists

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.ui.semantics.Role
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
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.PlaylistAdd
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.outlined.Movie
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.mavros.archiver.core.android.lists.AddToListState
import com.mavros.archiver.core.android.lists.ListsUiState
import com.mavros.archiver.core.android.lists.PlaylistUiState
import com.mavros.archiver.core.design.MavrosColors
import com.mavros.archiver.core.design.MonoLabel
import com.mavros.archiver.core.design.PosterImage
import com.mavros.archiver.core.model.PlaylistDetail
import com.mavros.archiver.core.model.PlaylistItem
import com.mavros.archiver.core.model.formatDurationShort
import com.mavros.archiver.mobile.ui.DetailSkeleton
import com.mavros.archiver.mobile.ui.ErrorState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun Screen(title: String, onBack: () -> Unit, content: @Composable (PaddingValues) -> Unit) {
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = { Text(title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = "Volver") } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
        content = content,
    )
}

private fun itemsText(n: Int) = if (n == 1) "1 elemento" else "$n elementos"

/** Mis listas (PL-07) */
@Composable
fun ListsContent(state: ListsUiState, onBack: () -> Unit, onOpen: (String) -> Unit, onRetry: () -> Unit) {
    Screen("Mis listas", onBack) { padding ->
        when (state) {
            ListsUiState.Loading -> DetailSkeleton(Modifier.padding(padding))
            is ListsUiState.Error -> ErrorState(state.error, onRetry, Modifier.padding(padding))
            is ListsUiState.Content -> if (state.lists.isEmpty()) {
                Box(Modifier.fillMaxSize().padding(padding).padding(32.dp).testTag("lists-empty"), contentAlignment = Alignment.Center) {
                    Text("Todavía no tienes listas. Usa \"Agregar a lista\" en una película o serie.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            } else {
                LazyColumn(Modifier.fillMaxSize().padding(padding).testTag("lists"), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(state.lists, key = { it.playlist.id }) { summary ->
                        Column(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(MavrosColors.Card)
                                .clickable(onClickLabel = "Abrir ${summary.playlist.name}") { onOpen(summary.playlist.id) }
                                .padding(16.dp).testTag("list-${summary.playlist.id}"),
                        ) {
                            Text(summary.playlist.name, style = MaterialTheme.typography.titleMedium)
                            Text(itemsText(summary.count), style = MonoLabel, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
    }
}

/** Una lista: "Reproducir lista" y sus elementos en orden (PL-07) */
@Composable
fun PlaylistContent(
    state: PlaylistUiState,
    onBack: () -> Unit,
    onPlay: (PlaylistDetail) -> Unit,
    onOpenItem: (PlaylistItem) -> Unit,
    onRetry: () -> Unit,
) {
    val title = (state as? PlaylistUiState.Content)?.detail?.playlist?.name.orEmpty()
    Screen(title, onBack) { padding ->
        when (state) {
            PlaylistUiState.Loading -> DetailSkeleton(Modifier.padding(padding))
            is PlaylistUiState.Error -> ErrorState(state.error, onRetry, Modifier.padding(padding))
            PlaylistUiState.NotAvailable -> Box(Modifier.fillMaxSize().padding(padding).testTag("not-available"), contentAlignment = Alignment.Center) {
                Text("Esta lista no existe.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            is PlaylistUiState.Content -> LazyColumn(
                Modifier.fillMaxSize().padding(padding).testTag("playlist"),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (state.detail.start != null) {
                    item {
                        Button(onClick = { onPlay(state.detail) }, shape = RoundedCornerShape(999.dp), modifier = Modifier.fillMaxWidth().height(52.dp).testTag("play-list")) {
                            Icon(Icons.Filled.PlayArrow, contentDescription = null)
                            Spacer(Modifier.width(8.dp))
                            Text("Reproducir lista", fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
                if (state.detail.items.isEmpty()) {
                    item { Text("Esta lista está vacía.", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.testTag("playlist-empty")) }
                }
                itemsIndexed(state.detail.items, key = { _, it -> it.id }) { i, item ->
                    Row(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(MavrosColors.Card)
                            .clickable(onClickLabel = "Abrir ${item.title}") { onOpenItem(item) }
                            .padding(12.dp).testTag("item-${item.id}"),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Text("${i + 1}", style = MonoLabel, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.width(20.dp))
                        Box(Modifier.width(44.dp).aspectRatio(2f / 3f).clip(RoundedCornerShape(6.dp)).background(MavrosColors.Background)) {
                            PosterImage(item.poster, Modifier.fillMaxSize()) {
                                Icon(Icons.Outlined.Movie, contentDescription = null, tint = MavrosColors.MutedForeground, modifier = Modifier.align(Alignment.Center))
                            }
                        }
                        Column(Modifier.weight(1f)) {
                            Text(item.title, style = MaterialTheme.typography.bodyLarge, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            val meta = item.movie?.let { listOfNotNull(it.episodeTag ?: it.releaseYear?.toString(), formatDurationShort(it.durationSeconds)) }
                                ?: listOfNotNull("Serie", item.series?.releaseYear?.toString())
                            Text(meta.joinToString(" · ").uppercase(), style = MonoLabel, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
    }
}

/** Botón "Agregar a lista" con su diálogo (PL-07). [onOpen] carga las listas al abrir. */
@Composable
fun AddToListButton(state: AddToListState, onOpen: () -> Unit, onToggle: (String) -> Unit, onCreate: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    OutlinedButton(onClick = { onOpen(); open = true }, shape = RoundedCornerShape(999.dp), modifier = Modifier.fillMaxWidth().testTag("add-to-list")) {
        Icon(Icons.AutoMirrored.Outlined.PlaylistAdd, contentDescription = null)
        Spacer(Modifier.width(8.dp))
        Text("Agregar a lista")
    }
    if (open) AddToListDialog(state, onToggle, onCreate, onDismiss = { open = false })
}

@Composable
fun AddToListDialog(state: AddToListState, onToggle: (String) -> Unit, onCreate: (String) -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Agregar a lista") },
        text = { AddToListBody(state, onToggle, onCreate) },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Listo") } },
    )
}

/** Contenido del diálogo: mis listas marcadas y crear una nueva (aparte para probarlo sin la ventana del diálogo) */
@Composable
fun AddToListBody(state: AddToListState, onToggle: (String) -> Unit, onCreate: (String) -> Unit) {
    var name by remember { mutableStateOf("") }
    val busy = state.busy != null
    Column(verticalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.testTag("add-to-list-dialog")) {
        val lists = state.lists
        when {
            lists == null && state.error == null -> CircularProgressIndicator(Modifier.size(24.dp))
            lists.isNullOrEmpty() -> Text("Todavía no tienes listas.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            else -> lists.forEach { m ->
                Row(
                    // Toda la fila es una casilla (lector de pantalla: "Para el finde, marcada")
                    Modifier.fillMaxWidth()
                        .toggleable(value = m.contains, enabled = !busy, role = Role.Checkbox) { onToggle(m.playlist.id) }
                        .testTag("toggle-${m.playlist.id}"),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (state.busy == m.playlist.id) CircularProgressIndicator(Modifier.size(24.dp).padding(2.dp))
                    else Checkbox(checked = m.contains, onCheckedChange = null)
                    Spacer(Modifier.width(8.dp))
                    Text(m.playlist.name, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = name,
                onValueChange = { if (it.length <= 100) name = it },
                label = { Text("Nueva lista") },
                singleLine = true,
                enabled = !busy,
                modifier = Modifier.weight(1f).testTag("new-list-name"),
            )
            TextButton(onClick = { onCreate(name); name = "" }, enabled = !busy && name.isNotBlank(), modifier = Modifier.testTag("create-list")) {
                if (state.busy == "new") CircularProgressIndicator(Modifier.size(18.dp)) else Text("Crear")
            }
        }
        state.error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.testTag("add-to-list-error")) }
    }
}
