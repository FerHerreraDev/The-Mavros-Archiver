package com.mavros.archiver.mobile

import androidx.compose.ui.graphics.toPixelMap
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import com.mavros.archiver.core.design.MavrosTheme
import com.mavros.archiver.mobile.login.LoginContent
import com.mavros.archiver.mobile.login.LoginUiState
import androidx.compose.foundation.layout.width
import androidx.compose.ui.unit.dp
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.GraphicsMode
import kotlin.test.assertTrue

/**
 * Pruebas que dependen de cómo se DIBUJA la UI (colores, medidas de texto). Usan los gráficos nativos
 * de Robolectric: en el modo por defecto ("legacy") el texto no se mide de verdad.
 * MOB-11: contraste WCAG ≥ 4.5 del texto contra el fondo OLED.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class ContrastTest {
    @get:Rule val compose = createComposeRule()

    private fun luminance(argb: androidx.compose.ui.graphics.Color): Double {
        fun f(c: Float) = if (c <= 0.03928f) c / 12.92 else Math.pow((c + 0.055) / 1.055, 2.4)
        return 0.2126 * f(argb.red) + 0.7152 * f(argb.green) + 0.0722 * f(argb.blue)
    }

    /** Contraste del píxel más claro y del más oscuro de la región: el texto es el extremo claro */
    private fun contrastOf(tag: String): Double {
        val pixels = compose.onNodeWithTag(tag).captureToImage().toPixelMap()
        val lums = buildList { for (x in 0 until pixels.width) for (y in 0 until pixels.height) add(luminance(pixels[x, y])) }
        return (lums.max() + 0.05) / (lums.min() + 0.05)
    }

    @Test fun `MOB-11 el titulo del login se lee completo (THE MAVROS en claro, no solo ARCHIVER)`() {
        compose.setContent { MavrosTheme { LoginContent(LoginUiState(), {}, {}, {}) } }
        // Solo "THE MAVROS": se mide la mitad izquierda del título, donde no está el rojo de ARCHIVER
        val pixels = compose.onNodeWithTag("brand").captureToImage().toPixelMap()
        val left = buildList { for (x in 0 until pixels.width / 2) for (y in 0 until pixels.height) add(luminance(pixels[x, y])) }
        val ratio = (left.max() + 0.05) / (left.min() + 0.05)
        assertTrue(ratio >= 4.5, "Contraste de \"THE MAVROS\": %.2f (mínimo 4.5)".format(ratio))
    }

    @Test fun `MOB-11 el texto de ayuda del login se lee`() {
        compose.setContent { MavrosTheme { LoginContent(LoginUiState(error = "Email o contraseña incorrectos."), {}, {}, {}) } }
        val ratio = contrastOf("login-error")
        assertTrue(ratio >= 4.5, "Contraste del error: %.2f".format(ratio))
    }

    @Test fun `MOB-07 en una tarjeta de 120 dp el año y la duración se ven completos`() {
        compose.setContent {
            MavrosTheme {
                androidx.compose.foundation.layout.Box(androidx.compose.ui.Modifier.width(120.dp)) {
                    com.mavros.archiver.mobile.ui.PosterCard(movie("9", "Larga", duration = 5952, year = 2026), onClick = {}, progress = 0.5f)
                }
            }
        }
        val node = compose.onNodeWithTag("meta-9", useUnmergedTree = true).fetchSemanticsNode()
        kotlin.test.assertEquals("2026 · 1h 39m", node.config[androidx.compose.ui.semantics.SemanticsProperties.Text].first().text)
        val result = mutableListOf<androidx.compose.ui.text.TextLayoutResult>()
        node.config[androidx.compose.ui.semantics.SemanticsActions.GetTextLayoutResult].action!!.invoke(result)
        val r = result.first()
        // Requisito: el texto no termina en "…" y su ancho natural cabe en la tarjeta (120 dp)
        val cardPx = with(compose.density) { 120.dp.toPx() }
        kotlin.test.assertFalse(r.isLineEllipsized(0), "La etiqueta termina en …")
        kotlin.test.assertTrue(r.multiParagraph.intrinsics.maxIntrinsicWidth <= cardPx, "Necesita ${r.multiParagraph.intrinsics.maxIntrinsicWidth}px y la tarjeta tiene ${cardPx}px")
    }
}
