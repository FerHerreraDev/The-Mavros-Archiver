package com.mavros.archiver.tv.lists

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.tv.material3.Button
import androidx.tv.material3.Icon
import androidx.tv.material3.ListItem
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.OutlinedButton
import androidx.tv.material3.Text
import com.mavros.archiver.core.android.lists.AddToListState
import com.mavros.archiver.core.android.lists.ListsUiState
import com.mavros.archiver.core.android.lists.PlaylistUiState
import com.mavros.archiver.core.design.MavrosColors
import com.mavros.archiver.core.design.MavrosLoader
import com.mavros.archiver.core.design.MonoLabel
import com.mavros.archiver.core.model.PlaylistDetail
import com.mavros.archiver.core.model.PlaylistItem
import com.mavros.archiver.tv.catalog.Message
import com.mavros.archiver.tv.catalog.errorText

/** Enfoca al abrir algo que vive en una LazyColumn: se crea después de esta composición */
@Composable
private fun FocusOnOpen(requester: FocusRequester, key: Any) {
    LaunchedEffect(key) {
        repeat(30) {
            withFrameNanos { }
            if (runCatching { requester.requestFocus() }.isSuccess) return@LaunchedEffect
        }
    }
}

private fun itemsText(n: Int) = if (n == 1) "1 elemento" else "$n elementos"

/** Mis listas en la tele (PL-07): la primera enfocada al abrir */
@Composable
fun TvListsScreen(state: ListsUiState, onOpen: (String) -> Unit, onRetry: () -> Unit) {
    Box(Modifier.fillMaxSize().background(MavrosColors.Background)) {
        when (state) {
            ListsUiState.Loading -> MavrosLoader(Modifier.align(Alignment.Center).testTag("tv-loading"), size = 72.dp)
            is ListsUiState.Error -> Message(errorText(state.error), onRetry)
            is ListsUiState.Content -> if (state.lists.isEmpty()) {
                Message("Todavía no tienes listas. Créalas desde el teléfono o la web.", null)
            } else {
                val first = remember { FocusRequester() }
                FocusOnOpen(first, state.lists.first().playlist.id)
                LazyColumn(Modifier.fillMaxSize().padding(horizontal = 96.dp).testTag("tv-lists"), contentPadding = PaddingValues(vertical = 48.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    item { Text("Mis listas", style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.Bold), color = MavrosColors.Foreground, modifier = Modifier.padding(bottom = 16.dp)) }
                    itemsIndexed(state.lists, key = { _, it -> it.playlist.id }) { i, summary ->
                        ListItem(
                            selected = false,
                            onClick = { onOpen(summary.playlist.id) },
                            headlineContent = { Text(summary.playlist.name) },
                            trailingContent = { Text(itemsText(summary.count), style = MonoLabel) },
                            modifier = (if (i == 0) Modifier.focusRequester(first) else Modifier).testTag("tv-list-${summary.playlist.id}"),
                        )
                    }
                }
            }
        }
    }
}

/** Una lista en la tele: "Reproducir lista" enfocado y los elementos en orden (PL-07) */
@Composable
fun TvPlaylistScreen(state: PlaylistUiState, onPlay: (PlaylistDetail) -> Unit, onOpenItem: (PlaylistItem) -> Unit, onRetry: () -> Unit) {
    Box(Modifier.fillMaxSize().background(MavrosColors.Background)) {
        when (state) {
            PlaylistUiState.Loading -> MavrosLoader(Modifier.align(Alignment.Center).testTag("tv-loading"), size = 72.dp)
            is PlaylistUiState.Error -> Message(errorText(state.error), onRetry)
            PlaylistUiState.NotAvailable -> Message("Esta lista no existe.", null)
            is PlaylistUiState.Content -> {
                val detail = state.detail
                val play = remember { FocusRequester() }
                if (detail.start != null) FocusOnOpen(play, detail.playlist.id)
                LazyColumn(Modifier.fillMaxSize().padding(horizontal = 96.dp).testTag("tv-playlist"), contentPadding = PaddingValues(vertical = 48.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    item {
                        Column(verticalArrangement = Arrangement.spacedBy(16.dp), modifier = Modifier.padding(bottom = 16.dp)) {
                            Text(detail.playlist.name, style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.Bold), color = MavrosColors.Foreground)
                            if (detail.start != null) {
                                Button(onClick = { onPlay(detail) }, modifier = Modifier.focusRequester(play).testTag("tv-play-list")) { Text("Reproducir lista", fontWeight = FontWeight.SemiBold) }
                            } else {
                                Text("Esta lista está vacía.", color = MavrosColors.MutedForeground)
                            }
                        }
                    }
                    itemsIndexed(detail.items, key = { _, it -> it.id }) { i, item ->
                        val meta = item.movie?.let { it.episodeTag ?: it.releaseYear?.toString() } ?: "Serie"
                        ListItem(
                            selected = false,
                            onClick = { onOpenItem(item) },
                            leadingContent = { Text("${i + 1}", style = MonoLabel) },
                            headlineContent = { Text(item.title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                            trailingContent = { Text(meta.orEmpty(), style = MonoLabel) },
                            modifier = Modifier.testTag("tv-item-${item.id}"),
                        )
                    }
                }
            }
        }
    }
}

/** "Agregar a lista" en la tele: mis listas marcadas, OK agrega o quita (PL-07). Crear listas, en el teléfono o la web. */
@Composable
fun TvAddToList(state: AddToListState, onOpen: () -> Unit, onToggle: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    OutlinedButton(onClick = { onOpen(); open = true }, modifier = Modifier.testTag("tv-add-to-list")) { Text("Agregar a lista") }
    if (!open) return
    Dialog(onDismissRequest = { open = false }) {
        val first = remember { FocusRequester() }
        Column(
            Modifier.width(480.dp).background(MavrosColors.Card, RoundedCornerShape(16.dp)).padding(24.dp).testTag("tv-add-to-list-dialog"),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text("Agregar a lista", style = MaterialTheme.typography.titleLarge, color = MavrosColors.Foreground)
            val lists = state.lists
            when {
                lists == null && state.error == null -> MavrosLoader(size = 40.dp)
                lists.isNullOrEmpty() -> Text("Todavía no tienes listas. Créalas desde el teléfono o la web.", color = MavrosColors.MutedForeground)
                else -> {
                    LaunchedEffect(Unit) { runCatching { first.requestFocus() } }
                    lists.forEachIndexed { i, m ->
                        ListItem(
                            selected = m.contains,
                            enabled = state.busy == null,
                            onClick = { onToggle(m.playlist.id) },
                            headlineContent = { Text(m.playlist.name) },
                            trailingContent = { if (m.contains) Icon(Icons.Filled.Check, contentDescription = "En la lista") },
                            modifier = (if (i == 0) Modifier.focusRequester(first) else Modifier).testTag("tv-toggle-${m.playlist.id}"),
                        )
                    }
                }
            }
            state.error?.let { Text(it, color = MavrosColors.Accent) }
        }
    }
}
