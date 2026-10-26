package com.mavros.archiver.core.design

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Loader de la marca: un arco rojo con estela que gira y "respira" (se alarga y se acorta),
 * más un punto central que late. Con "Quitar animaciones" se queda quieto (LOAD-01).
 */
@Composable
fun MavrosLoader(modifier: Modifier = Modifier, size: Dp = 64.dp, color: Color = MavrosColors.Accent) {
    val reduceMotion = rememberReduceMotion()
    val transition = rememberInfiniteTransition(label = "loader")
    val rotation = if (reduceMotion) 0f else transition.animateFloat(
        0f, 360f, infiniteRepeatable(tween(1100, easing = LinearEasing)), label = "rotation",
    ).value
    val sweep = if (reduceMotion) 270f else transition.animateFloat(
        40f, 290f, infiniteRepeatable(tween(900, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "sweep",
    ).value
    val pulse = if (reduceMotion) 1f else transition.animateFloat(
        0.55f, 1f, infiniteRepeatable(tween(900, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "pulse",
    ).value

    Canvas(modifier.size(size).rotate(rotation).semantics { shimmerAnimated = !reduceMotion }) {
        val stroke = this.size.minDimension * 0.09f
        val inset = stroke / 2
        val arcSize = Size(this.size.width - stroke, this.size.height - stroke)
        // Pista tenue
        drawArc(color.copy(alpha = 0.15f), 0f, 360f, false, Offset(inset, inset), arcSize, style = Stroke(stroke))
        // Arco con estela: transparente en la cola, sólido en la punta
        drawArc(
            brush = Brush.sweepGradient(listOf(color.copy(alpha = 0f), color), center = center),
            startAngle = 360f - sweep,
            sweepAngle = sweep,
            useCenter = false,
            topLeft = Offset(inset, inset),
            size = arcSize,
            style = Stroke(stroke, cap = StrokeCap.Round),
        )
        drawCircle(color.copy(alpha = 0.9f), radius = this.size.minDimension * 0.09f * pulse, center = center)
    }
}
