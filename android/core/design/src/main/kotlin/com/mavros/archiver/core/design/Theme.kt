package com.mavros.archiver.core.design

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/**
 * Paleta Mavros: los mismos tokens que app/globals.css de la web (oklch convertidos a sRGB).
 * OLED: fondo casi negro puro, rojo de acento, texto gris claro.
 */
object MavrosColors {
    val Background = Color(0xFF030303) // oklch(0.02 0 0)
    val Foreground = Color(0xFFE0E0E0) // oklch(0.9 0 0)
    val Card = Color(0xFF111111) // oklch(0.1 0 0)
    val Border = Color(0xFF262626) // oklch(0.2 0 0)
    val MutedForeground = Color(0xFF878787) // oklch(0.6 0 0)
    val Accent = Color(0xFFE7000B) // oklch(0.577 0.245 27.325)
    val Primary = Color(0xFFFAFAFA) // oklch(0.985 0 0)
    val Success = Color(0xFF34D399)
}

private val colors = darkColorScheme(
    primary = MavrosColors.Primary,
    onPrimary = MavrosColors.Background,
    secondary = MavrosColors.Accent,
    onSecondary = Color.White,
    tertiary = MavrosColors.Accent,
    background = MavrosColors.Background,
    onBackground = MavrosColors.Foreground,
    surface = MavrosColors.Background,
    onSurface = MavrosColors.Foreground,
    surfaceVariant = MavrosColors.Card,
    onSurfaceVariant = MavrosColors.MutedForeground,
    surfaceContainer = MavrosColors.Card,
    surfaceContainerHigh = MavrosColors.Card,
    outline = MavrosColors.Border,
    outlineVariant = MavrosColors.Border,
    error = Color(0xFFFF6467),
    onError = Color.Black,
)

/** Etiquetas en mono mayúsculas, como "PRIVATE ACCESS" en la web */
val MonoLabel = TextStyle(fontFamily = FontFamily.Monospace, fontSize = 11.sp, letterSpacing = 1.2.sp, fontWeight = FontWeight.Medium)

private val typography = Typography().run {
    copy(
        headlineMedium = headlineMedium.copy(fontWeight = FontWeight.Bold, letterSpacing = (-0.5).sp),
        titleLarge = titleLarge.copy(fontWeight = FontWeight.Bold, letterSpacing = (-0.3).sp),
    )
}

@Composable
fun MavrosTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = colors, typography = typography, content = content)
}
