package com.mavros.archiver.mobile

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * La app real, instalada en el emulador, contra el Supabase LOCAL (10.0.2.2).
 * Los datos los prepara android/scripts/e2e-emulator.sh y llegan como argumentos.
 */
@RunWith(AndroidJUnit4::class)
class EmulatorSmokeTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()

    private val args = InstrumentationRegistry.getArguments()
    private fun arg(name: String) = requireNotNull(args.getString(name)) { "Falta el argumento $name (usa android/scripts/e2e-emulator.sh)" }

    /** Con -e screenshots true guarda capturas en el almacenamiento de la app (para revisión visual) */
    private fun shot(name: String) {
        if (args.getString("screenshots") != "true") return
        compose.waitForIdle()
        val bitmap = compose.onRoot().captureToImage().asAndroidBitmap()
        val dir = compose.activity.getExternalFilesDir("screenshots")!!.apply { mkdirs() }
        java.io.File(dir, "$name.png").outputStream().use { bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
    }

    private fun waitForTag(tag: String, timeout: Long = 15_000) =
        compose.waitUntil(timeout) { compose.onAllNodes(hasTestTag(tag)).fetchSemanticsNodes().isNotEmpty() }

    @Test
    fun loginCatalogoDetallePersistenciaYLogout() {
        val title = arg("movieTitle")

        // MOB-03: login real
        waitForTag("email")
        shot("1-login")
        compose.onNodeWithTag("email").performTextInput(arg("email"))
        compose.onNodeWithTag("password").performTextInput(arg("password"))
        compose.onNodeWithTag("submit").performClick()

        // MOB-07: catálogo con "Seguir viendo" y sin el borrador
        waitForTag("catalog")
        compose.waitUntil(15_000) { compose.onAllNodes(hasText("Seguir viendo")).fetchSemanticsNodes().isNotEmpty() }
        shot("2-catalogo")
        compose.onNodeWithTag("catalog").performScrollToNode(hasText(title))
        compose.onNodeWithText(arg("draftTitle")).assertDoesNotExist()

        // MOB-04: "reabrir" la app (recrear la actividad) no pide contraseña otra vez
        compose.activityRule.scenario.recreate()
        waitForTag("catalog")

        // MOB-08: detalle con "Continuar desde 12:34" (progreso sembrado: 754 s)
        // Aparece dos veces (en "Seguir viendo" y en "Recién agregadas"), igual que en la web: se abre la primera
        val cards = compose.onAllNodes(SemanticsMatcher.expectValue(SemanticsProperties.ContentDescription, listOf("Ver $title")))
        cards.assertCountEquals(2)
        cards.onFirst().performClick()
        waitForTag("title")
        compose.onNodeWithTag("title").assertTextContains(title)
        compose.onNodeWithText("Continuar desde 12:34").assertIsDisplayed()
        shot("3-detalle")
        compose.onNode(SemanticsMatcher.expectValue(SemanticsProperties.ContentDescription, listOf("Volver"))).performClick()

        // MOB-05: cerrar sesión vuelve al login
        waitForTag("catalog")
        compose.onNode(SemanticsMatcher.expectValue(SemanticsProperties.ContentDescription, listOf("Perfil"))).performClick()
        waitForTag("profile-email")
        compose.onNodeWithTag("profile-email").assertTextContains(arg("email"))
        shot("4-perfil")
        compose.onNodeWithTag("sign-out").performClick()
        waitForTag("submit")
    }
}
