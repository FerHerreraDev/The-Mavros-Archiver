package com.mavros.archiver.tv

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performKeyInput
import androidx.compose.ui.test.pressKey
import com.mavros.archiver.core.android.update.UpdateProblem
import com.mavros.archiver.core.android.update.UpdateUiState
import com.mavros.archiver.core.model.AppRelease
import com.mavros.archiver.tv.update.TvUpdateScreen
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.test.assertEquals

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], qualifiers = "w960dp-h540dp-television-xhdpi")
@OptIn(ExperimentalTestApi::class)
class TvUpdateScreenTest {
    @get:Rule val compose = createComposeRule()
    private val release = AppRelease(7, "1.3.0", "a".repeat(64), "https://s.test/7.apk")

    @Test fun `UPD-04 la tele pide instalar con el boton enfocado para el control`() {
        var installs = 0
        compose.setContent { MavrosTvTheme { TvUpdateScreen(UpdateUiState.Required(release), onInstall = { installs++ }, onOpenSettings = {}) } }
        compose.onNodeWithText("Hay una versión nueva").assertIsDisplayed()
        compose.onNodeWithText("1.3.0", substring = true).assertIsDisplayed()
        compose.onNodeWithTag("tv-update-install").assertIsFocused()
        compose.onRoot().performKeyInput { pressKey(Key.DirectionCenter) }
        assertEquals(1, installs)
    }

    @Test fun `UPD-05 avance, problema con Reintentar y permiso con Abrir ajustes`() {
        var state: UpdateUiState by mutableStateOf(UpdateUiState.Downloading(release, 0.42f))
        var settings = 0
        compose.setContent { MavrosTvTheme { TvUpdateScreen(state, onInstall = {}, onOpenSettings = { settings++ }) } }
        compose.onNodeWithTag("tv-update-progress").assertTextContains("42 %", substring = true)

        state = UpdateUiState.Required(release, UpdateProblem.Corrupt)
        compose.onNodeWithTag("tv-update-problem").assertTextContains("dañada", substring = true)
        compose.onNodeWithTag("tv-update-install").assertTextContains("Reintentar")

        state = UpdateUiState.NeedsPermission(release)
        compose.onNodeWithTag("tv-update-permission").assertIsDisplayed()
        compose.onNodeWithTag("tv-update-settings").assertIsFocused()
        compose.onRoot().performKeyInput { pressKey(Key.DirectionCenter) }
        assertEquals(1, settings)
    }
}
