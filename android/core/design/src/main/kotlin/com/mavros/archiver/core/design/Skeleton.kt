package com.mavros.archiver.core.design

import android.provider.Settings
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.runtime.State
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.semantics.SemanticsPropertyKey
import androidx.compose.ui.semantics.SemanticsPropertyReceiver
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay

// Skeleton con shimmer (LOAD-01), igual que la web:
// - Un solo brillo recorre TODA la pantalla cada 1.6 s; cada bloque dibuja la parte que le toca
//   según su posición, así todos los bloques forman una sola ola (no una por bloque).
// - Aparece 200 ms después: si los datos llegan antes, nunca se ve (sin parpadeo).
// - Con "Quitar animaciones" del sistema (escala de animación 0) no hay brillo ni desvanecido.

const val SHIMMER_CYCLE_MS = 1600
const val SKELETON_DELAY_MS = 200L
const val REVEAL_FADE_MS = 300

private val ShimmerHighlight = Color.White.copy(alpha = 0.07f)

/** Semántica para pruebas: true si el shimmer de este skeleton se anima */
val ShimmerAnimatedKey = SemanticsPropertyKey<Boolean>("ShimmerAnimated")
var SemanticsPropertyReceiver.shimmerAnimated by ShimmerAnimatedKey

/** "Quitar animaciones" de Accesibilidad / opciones de desarrollador pone esta escala en 0 */
@Composable
fun rememberReduceMotion(): Boolean {
    val resolver = LocalContext.current.contentResolver
    return remember(resolver) { Settings.Global.getFloat(resolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f }
}

private val LocalShimmer = staticCompositionLocalOf<State<Float>?> { null }

/** Contenedor de un skeleton: reloj único del brillo para todos sus bloques */
@Composable
fun ShimmerHost(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    val reduceMotion = rememberReduceMotion()
    val progress = if (reduceMotion) {
        null
    } else {
        rememberInfiniteTransition(label = "shimmer").animateFloat(
            initialValue = 0f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(tween(SHIMMER_CYCLE_MS, easing = FastOutSlowInEasing), RepeatMode.Restart),
            label = "shimmer-progress",
        )
    }
    CompositionLocalProvider(LocalShimmer provides progress) {
        Box(modifier.semantics { shimmerAnimated = progress != null }) { content() }
    }
}

/**
 * Bloque gris del skeleton. El progreso del brillo se lee solo al dibujar: cada cuadro
 * redibuja, pero nunca recompone.
 */
fun Modifier.skeleton(shape: Shape = RoundedCornerShape(6.dp)): Modifier = composed {
    val progress = LocalShimmer.current
    val screenWidth = LocalWindowInfo.current.containerSize.width.toFloat()
    var origin by remember { mutableStateOf(Offset.Zero) }
    this
        .onGloballyPositioned { origin = it.positionInRoot() }
        .clip(shape)
        .drawBehind {
            drawRect(MavrosColors.Card)
            if (progress != null && screenWidth > 0f) {
                val band = screenWidth * 0.35f
                // De -20 % a 120 % del ancho de pantalla, en coordenadas de este bloque
                val center = -0.2f * screenWidth + 1.4f * screenWidth * progress.value - origin.x
                drawRect(
                    Brush.linearGradient(
                        colors = listOf(Color.Transparent, ShimmerHighlight, Color.Transparent),
                        start = Offset(center - band, 0f),
                        end = Offset(center + band, size.height * 0.2f),
                    ),
                )
            }
        }
}

/** Muestra [content] solo si sigue cargando después de 200 ms, con un fundido corto */
@Composable
fun DelayedReveal(modifier: Modifier = Modifier, delayMillis: Long = SKELETON_DELAY_MS, content: @Composable () -> Unit) {
    var visible by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        delay(delayMillis)
        visible = true
    }
    val reduceMotion = rememberReduceMotion()
    AnimatedVisibility(
        visible = visible,
        modifier = modifier,
        enter = if (reduceMotion) EnterTransition.None else fadeIn(tween(REVEAL_FADE_MS, easing = LinearEasing)),
    ) { content() }
}
