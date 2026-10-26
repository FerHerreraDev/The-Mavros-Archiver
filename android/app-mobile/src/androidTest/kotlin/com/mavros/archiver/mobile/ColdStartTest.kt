package com.mavros.archiver.mobile

import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.Assert.assertTrue

/**
 * MOB-12: al abrir la app con sesión guardada (proceso nuevo), antes del contenido solo puede
 * aparecer el estado de carga: nunca "bóveda vacía" ni un error. El script corre primero
 * `login` y luego `coldStart` en otro proceso (otra invocación de am instrument).
 */
@RunWith(AndroidJUnit4::class)
class ColdStartTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    private val args = InstrumentationRegistry.getArguments()

    @Test fun login() {
        compose.waitUntil(15_000) { compose.onAllNodes(hasTestTag("email")).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithTag("email").performTextInput(args.getString("email")!!)
        compose.onNodeWithTag("password").performTextInput(args.getString("password")!!)
        compose.onNodeWithTag("submit").performClick()
        compose.waitUntil(15_000) { compose.onAllNodes(hasTestTag("catalog")).fetchSemanticsNodes().isNotEmpty() }
    }

    @Test fun coldStart() {
        val seen = mutableListOf<String>()
        val tags = listOf("submit", "loading", "skeleton", "error", "empty", "catalog")
        val deadline = System.currentTimeMillis() + 10_000
        while (System.currentTimeMillis() < deadline) {
            val now = tags.filter { compose.onAllNodes(hasTestTag(it), useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty() }
            val state = now.joinToString("+").ifEmpty { "(nada)" }
            if (seen.lastOrNull() != state) seen += state
            if ("catalog" in now && "empty" !in now && "error" !in now && compose.onAllNodes(hasTestTag("poster-${args.getString("movieId")}"), useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty()) break
            Thread.sleep(16)
        }
        val forbidden = seen.filter { "empty" in it || "error" in it || "submit" in it }
        assertTrue("Secuencia de estados al abrir: $seen", forbidden.isEmpty())
        assertTrue("Nunca llegó al catálogo: $seen", seen.last().contains("catalog"))
        println("MOB-12 secuencia: $seen")
    }
}
