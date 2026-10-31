package com.mavros.archiver.mobile

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.mavros.archiver.core.android.update.UpdateProblem
import com.mavros.archiver.core.android.update.UpdateUiState
import com.mavros.archiver.core.design.MavrosTheme
import com.mavros.archiver.core.model.AppRelease
import com.mavros.archiver.mobile.update.UpdateScreen
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.test.assertEquals

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class UpdateScreenTest {
    @get:Rule val compose = createComposeRule()
    private val release = AppRelease(7, "1.3.0", "a".repeat(64), "https://s.test/7.apk")

    @Test fun `UPD-04 a pantalla completa con la version y el boton Instalar`() {
        var installs = 0
        compose.setContent { MavrosTheme { UpdateScreen(UpdateUiState.Required(release), onInstall = { installs++ }, onOpenSettings = {}) } }
        compose.onNodeWithText("Hay una versión nueva").assertIsDisplayed()
        compose.onNodeWithText("1.3.0", substring = true).assertIsDisplayed()
        compose.onNodeWithTag("update-install").assertTextContains("Instalar").performClick()
        assertEquals(1, installs)
    }

    @Test fun `UPD-05 avance, problema con Reintentar y permiso con Abrir ajustes`() {
        var state: UpdateUiState by mutableStateOf(UpdateUiState.Downloading(release, 0.5f))
        var settings = 0
        compose.setContent { MavrosTheme { UpdateScreen(state, onInstall = {}, onOpenSettings = { settings++ }) } }
        compose.onNodeWithTag("update-progress").assertTextContains("50 %", substring = true)

        state = UpdateUiState.Required(release, UpdateProblem.Network)
        compose.onNodeWithTag("update-problem").assertTextContains("internet", substring = true)
        compose.onNodeWithTag("update-install").assertTextContains("Reintentar")

        state = UpdateUiState.NeedsPermission(release)
        compose.onNodeWithTag("update-permission").assertIsDisplayed()
        compose.onNodeWithTag("update-settings").performClick()
        assertEquals(1, settings)
    }

    @Test fun `UPD-04 sin version nueva el catalogo se ve normal`() {
        val container = FakeContainer(auth = FakeAuthRepository(com.mavros.archiver.core.data.SessionState.SignedIn("u", "u@test")))
        compose.setContent { MavrosTheme { MavrosNavHost(container) } }
        compose.waitForIdle()
        compose.onNodeWithTag("update").assertDoesNotExist()
    }
}
