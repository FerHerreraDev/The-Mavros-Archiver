package com.mavros.archiver.mobile.catalog

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridItemSpanScope
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.outlined.Movie
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mavros.archiver.core.design.MavrosColors
import com.mavros.archiver.core.model.Catalog
import com.mavros.archiver.core.model.ProgressRules
import com.mavros.archiver.mobile.ui.ErrorState
import com.mavros.archiver.mobile.ui.CatalogSkeleton
import com.mavros.archiver.mobile.ui.PosterCard

@Composable
fun CatalogScreen(viewModel: CatalogViewModel, onOpenMovie: (String) -> Unit, onOpenProfile: () -> Unit) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    // Al regresar a esta pantalla, "Seguir viendo" se actualiza
    LifecycleResumeEffect(Unit) {
        viewModel.refresh()
        onPauseOrDispose { }
    }
    CatalogContent(state, onOpenMovie, onOpenProfile, viewModel::selectGenre, viewModel::retry)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CatalogContent(
    state: CatalogUiState,
    onOpenMovie: (String) -> Unit,
    onOpenProfile: () -> Unit,
    onSelectGenre: (String?) -> Unit,
    onRetry: () -> Unit,
) {
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            CenterAlignedTopAppBar(
                title = {
                    Text(
                        buildAnnotatedString {
                            append("THE MAVROS ")
                            withStyle(SpanStyle(color = MavrosColors.Accent)) { append("ARCHIVER") }
                        },
                        fontWeight = FontWeight.Bold,
                    )
                },
                actions = {
                    IconButton(onClick = onOpenProfile) { Icon(Icons.Outlined.AccountCircle, contentDescription = "Perfil") }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
            )
        },
    ) { padding ->
        when (state) {
            // Mismo padding que CatalogGrid: lo aplica la cuadrícula, no el contenedor
            CatalogUiState.Loading -> CatalogSkeleton(padding)
            is CatalogUiState.Error -> ErrorState(state.error, onRetry, Modifier.padding(padding))
            is CatalogUiState.Content -> CatalogGrid(state.catalog, state.genre, padding, onOpenMovie, onSelectGenre)
        }
    }
}

@Composable
private fun CatalogGrid(
    catalog: Catalog,
    genre: String?,
    padding: PaddingValues,
    onOpenMovie: (String) -> Unit,
    onSelectGenre: (String?) -> Unit,
) {
    val full: LazyGridItemSpanScope.() -> GridItemSpan = { GridItemSpan(maxLineSpan) }
    LazyVerticalGrid(
        columns = GridCells.Adaptive(minSize = 120.dp),
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = padding.calculateTopPadding() + 8.dp, bottom = padding.calculateBottomPadding() + 24.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).testTag("catalog"),
    ) {
        if (catalog.continueWatching.isNotEmpty()) {
            item(span = full) { SectionTitle("Seguir viendo") }
            item(span = full) {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.testTag("continue-row")) {
                    items(catalog.continueWatching, key = { it.movie.id }) { item ->
                        PosterCard(
                            movie = item.movie,
                            onClick = { onOpenMovie(item.movie.id) },
                            progress = ProgressRules.progressRatio(item.positionSeconds, item.movie.durationSeconds),
                            modifier = Modifier.width(120.dp),
                        )
                    }
                }
            }
        }

        item(span = full) { SectionTitle("Recién agregadas") }

        if (catalog.genres.isNotEmpty()) {
            item(span = full) {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.testTag("genres")) {
                    item { GenreChip("Todas", genre == null) { onSelectGenre(null) } }
                    items(catalog.genres) { g -> GenreChip(g.replaceFirstChar { it.uppercase() }, genre == g) { onSelectGenre(g) } }
                }
            }
        }

        if (catalog.recent.isEmpty()) {
            item(span = full) {
                Column(Modifier.padding(vertical = 48.dp).testTag("empty"), horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Outlined.Movie, contentDescription = null, tint = MavrosColors.MutedForeground)
                    Spacer(Modifier.height(8.dp))
                    Text(
                        if (genre != null) "No hay películas de \"$genre\" todavía." else "La bóveda está vacía por ahora.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        } else {
            items(catalog.recent, key = { it.id }) { movie -> PosterCard(movie, onClick = { onOpenMovie(movie.id) }) }
        }
    }
}

@Composable
private fun SectionTitle(text: String) {
    Text(text, style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = 8.dp).semantics { heading() })
}

@Composable
private fun GenreChip(label: String, selected: Boolean, onClick: () -> Unit) {
    FilterChip(
        selected = selected,
        onClick = onClick,
        label = { Text(label) },
        colors = FilterChipDefaults.filterChipColors(
            selectedContainerColor = MavrosColors.Accent.copy(alpha = 0.18f),
            selectedLabelColor = MaterialTheme.colorScheme.onSurface,
        ),
        border = FilterChipDefaults.filterChipBorder(enabled = true, selected = selected, borderColor = MavrosColors.Border, selectedBorderColor = MavrosColors.Accent),
    )
}
