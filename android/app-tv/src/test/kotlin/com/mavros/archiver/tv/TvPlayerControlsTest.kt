package com.mavros.archiver.tv

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performKeyInput
import androidx.compose.ui.test.pressKey
import com.mavros.archiver.core.android.player.qualityLabels
import com.mavros.archiver.core.android.player.TrackChoices
import com.mavros.archiver.core.model.TrackOption
import com.mavros.archiver.tv.player.TvPlayerControls
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import kotlin.test.assertEquals

/** TV-06: controles del reproductor de la tele, manejados con el control remoto */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35], qualifiers = "w960dp-h540dp-television-xhdpi")
@OptIn(ExperimentalTestApi::class)
class TvPlayerControlsTest {
    @get:Rule val compose = createComposeRule()

    private var toggles = 0
    private var back = 0
    private var forward = 0
    private var quality: Int? = -1
    private var hidden = 0
    private var audio: String? = null
    private var subtitles: String? = "sin tocar"

    private fun controls(visible: Boolean = true, tracks: TrackChoices = TrackChoices()) = compose.setContent {
        MavrosTvTheme {
            TvPlayerControls(
                visible = visible,
                title = "Akira",
                isPlaying = true,
                positionMs = 754_000,
                durationMs = 7_440_000,
                qualities = qualityLabels(listOf(1080, 720, 480)),
                selectedQuality = null,
                onTogglePlay = { toggles++ },
                onSeekBack = { back++ },
                onSeekForward = { forward++ },
                onSelectQuality = { quality = it },
                interaction = 0,
                onAutoHide = { hidden++ },
                tracks = tracks,
                onSelectAudio = { audio = it },
                onSelectSubtitles = { subtitles = it },
            )
        }
    }

    private fun press(key: Key) {
        compose.onRoot().performKeyInput { pressKey(key) }
        compose.waitForIdle()
    }

    @Test fun `al aparecer el foco esta en reproducir-pausa y OK pausa una sola vez`() {
        controls()
        compose.onNodeWithTag("tv-play-pause").assertIsFocused()
        press(Key.DirectionCenter)
        assertEquals(1, toggles)
    }

    @Test fun `las flechas se mueven entre botones (no adelantan) y OK activa el enfocado`() {
        controls()
        press(Key.DirectionRight)
        compose.onNodeWithTag("tv-forward").assertIsFocused()
        assertEquals(0, forward, "mover el foco no adelanta")
        press(Key.DirectionCenter)
        assertEquals(1, forward)
        press(Key.DirectionLeft); press(Key.DirectionLeft)
        compose.onNodeWithTag("tv-back10").assertIsFocused()
        press(Key.DirectionCenter)
        assertEquals(1, back)
        assertEquals(0, toggles)
    }

    @Test fun `Calidad abre las opciones y elegir 720p la aplica`() {
        controls()
        press(Key.DirectionRight); press(Key.DirectionRight)
        compose.onNodeWithTag("tv-quality").assertIsFocused()
        press(Key.DirectionCenter)
        // "Automática" también es la etiqueta de la calidad actual junto al botón: se busca la opción de la lista
        compose.onNodeWithTag("tv-quality-Automática").assertIsDisplayed()
        compose.onNodeWithTag("tv-quality-1080p").assertIsDisplayed()
        compose.onNodeWithTag("tv-quality-720p").assertIsDisplayed()
        // El diálogo es otra ventana (otra raíz): las teclas se mandan ahí.
        // El foco entra a la lista: bajar hasta 720p (Automática → 1080p → 720p)
        val dialog = compose.onNodeWithTag("tv-quality-Automática")
        dialog.assertIsFocused()
        dialog.performKeyInput { pressKey(Key.DirectionDown) }
        compose.waitForIdle()
        compose.onNodeWithTag("tv-quality-1080p").performKeyInput { pressKey(Key.DirectionDown) }
        compose.waitForIdle()
        compose.onNodeWithTag("tv-quality-720p").assertIsFocused().performKeyInput { pressKey(Key.DirectionCenter) }
        compose.waitForIdle()
        assertEquals(720, quality)
        assertEquals(0, toggles, "elegir calidad no pausa")
    }

    @Test fun `muestra titulo y tiempo`() {
        controls()
        compose.onNodeWithText("Akira").assertIsDisplayed()
        compose.onNodeWithText("12:34 / 2:04:00").assertIsDisplayed()
    }

    @Test fun `ocultos no se ve nada`() {
        controls(visible = false)
        compose.onNodeWithTag("tv-play-pause").assertDoesNotExist()
        compose.onNodeWithText("Akira").assertDoesNotExist()
    }

    @Test fun `se ocultan solos tras 5 s sin tocar nada`() {
        compose.mainClock.autoAdvance = false
        controls()
        compose.mainClock.advanceTimeBy(4_000)
        assertEquals(0, hidden)
        compose.mainClock.advanceTimeBy(1_500)
        assertEquals(1, hidden)
    }

    @Test fun `con la lista de calidades abierta no se ocultan`() {
        controls()
        press(Key.DirectionRight); press(Key.DirectionRight); press(Key.DirectionCenter)
        compose.onNodeWithTag("tv-quality-Automática").assertIsDisplayed()
        compose.mainClock.autoAdvance = false
        compose.mainClock.advanceTimeBy(12_000)
        assertEquals(0, hidden, "la lista abierta detiene el temporizador")
    }

    private val languages = TrackChoices(
        audio = listOf(TrackOption("es", "Español"), TrackOption("en", "Inglés")),
        selectedAudio = "es",
        subtitles = listOf(TrackOption("es", "Español")),
    )

    @Test fun `TV-09 Audio y Subtitulos junto a Calidad - elegir ingles con el control`() {
        controls(tracks = languages)
        compose.onNodeWithText("Desactivados").assertIsDisplayed()
        press(Key.DirectionRight); press(Key.DirectionRight); press(Key.DirectionRight)
        compose.onNodeWithTag("tv-audio").assertIsFocused()
        press(Key.DirectionCenter)
        // El foco empieza en el idioma elegido (Español): bajar a Inglés
        compose.onNodeWithTag("tv-audio-es").assertIsFocused().performKeyInput { pressKey(Key.DirectionDown) }
        compose.waitForIdle()
        compose.onNodeWithTag("tv-audio-en").assertIsFocused().performKeyInput { pressKey(Key.DirectionCenter) }
        compose.waitForIdle()
        assertEquals("en", audio)
        assertEquals(0, toggles, "elegir idioma no pausa")
    }

    @Test fun `TV-09 Subtitulos - prender en espanol con el control`() {
        controls(tracks = languages)
        repeat(4) { press(Key.DirectionRight) }
        compose.onNodeWithTag("tv-subtitles").assertIsFocused()
        press(Key.DirectionCenter)
        compose.onNodeWithTag("tv-subtitles-off").assertIsFocused().performKeyInput { pressKey(Key.DirectionDown) }
        compose.waitForIdle()
        compose.onNodeWithTag("tv-subtitles-es").assertIsFocused().performKeyInput { pressKey(Key.DirectionCenter) }
        compose.waitForIdle()
        assertEquals("es", subtitles)
    }

    @Test fun `TV-09 sin idiomas que elegir no aparecen los botones`() {
        controls()
        compose.onNodeWithTag("tv-audio").assertDoesNotExist()
        compose.onNodeWithTag("tv-subtitles").assertDoesNotExist()
    }
}
