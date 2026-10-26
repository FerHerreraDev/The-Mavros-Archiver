package com.mavros.archiver.mobile.ui

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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.mavros.archiver.core.design.DelayedReveal
import com.mavros.archiver.core.design.ShimmerHost
import com.mavros.archiver.core.design.skeleton

// Skeletons con la forma real de cada pantalla (LOAD-01). Las medidas copian CatalogGrid y
// MovieDetailBody para que, al llegar los datos, nada salte de lugar.

private val PosterShape = RoundedCornerShape(12.dp)
private val Pill = RoundedCornerShape(999.dp)
private val ChipWidths = listOf(64.dp, 80.dp, 56.dp, 96.dp, 72.dp)
private val TitleFractions = listOf(0.8f, 0.6f, 0.92f, 0.66f, 0.75f)
const val SKELETON_CARDS = 12

/** Contenedor común: vacío los primeros 200 ms (tag "loading"), luego el skeleton (tag "skeleton") */
@Composable
private fun SkeletonScreen(modifier: Modifier, description: String, content: @Composable () -> Unit) {
    Box(modifier.fillMaxSize().testTag("loading")) {
        DelayedReveal {
            ShimmerHost(
                Modifier
                    .fillMaxSize()
                    .semantics(mergeDescendants = true) { contentDescription = description }
                    .testTag("skeleton"),
            ) { content() }
        }
    }
}

@Composable
fun CatalogSkeleton(padding: PaddingValues, modifier: Modifier = Modifier) {
    SkeletonScreen(modifier, "Cargando catálogo") {
        LazyVerticalGrid(
            columns = GridCells.Adaptive(minSize = 120.dp),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = padding.calculateTopPadding() + 8.dp, bottom = padding.calculateBottomPadding() + 24.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
            userScrollEnabled = false,
            modifier = Modifier.fillMaxSize(),
        ) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                Box(Modifier.padding(top = 8.dp)) { Box(Modifier.width(180.dp).height(28.dp).skeleton()) }
            }
            item(span = { GridItemSpan(maxLineSpan) }) {
                // Los FilterChip miden 32 dp pero reservan 48 dp de área táctil: la fila mide 48
                Row(Modifier.height(48.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    ChipWidths.forEach { Box(Modifier.width(it).height(32.dp).skeleton(Pill)) }
                }
            }
            items(SKELETON_CARDS) { i ->
                Column(Modifier.testTag("skeleton-card")) {
                    Box(Modifier.fillMaxWidth().aspectRatio(2f / 3f).skeleton(PosterShape).testTag("skeleton-poster"))
                    Spacer(Modifier.height(6.dp))
                    Box(Modifier.fillMaxWidth(TitleFractions[i % TitleFractions.size]).height(14.dp).skeleton())
                    Spacer(Modifier.height(6.dp))
                    Box(Modifier.fillMaxWidth(0.5f).height(10.dp).skeleton())
                }
            }
        }
    }
}

@Composable
fun DetailSkeleton(modifier: Modifier = Modifier) {
    SkeletonScreen(modifier, "Cargando película") {
        Column(Modifier.padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                Box(Modifier.width(140.dp).aspectRatio(2f / 3f).skeleton(PosterShape).testTag("skeleton-poster"))
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(Modifier.fillMaxWidth(0.9f).height(26.dp).skeleton())
                    Box(Modifier.fillMaxWidth(0.6f).height(26.dp).skeleton())
                    Box(Modifier.fillMaxWidth(0.7f).height(12.dp).skeleton())
                }
            }
            Box(Modifier.fillMaxWidth().height(52.dp).skeleton(Pill))
            listOf(1f, 0.95f, 0.98f, 0.6f).forEach { Box(Modifier.fillMaxWidth(it).height(14.dp).skeleton()) }
        }
    }
}
