package com.mavros.archiver.mobile

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import com.mavros.archiver.core.data.DataResult
import com.mavros.archiver.core.data.RequestResult
import com.mavros.archiver.core.data.SessionState
import com.mavros.archiver.core.design.MavrosTheme
import com.mavros.archiver.core.model.Catalog
import com.mavros.archiver.core.model.CatalogSeries
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.test.assertEquals

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class SearchTest {
    @get:Rule val compose = createComposeRule()

    private fun app(container: FakeContainer = FakeContainer(auth = FakeAuthRepository(SessionState.SignedIn("u", "u@test")))): FakeContainer {
        container.catalog.catalogResult = DataResult.Success(
            Catalog(listOf("drama"), listOf(movie("1", "Sense and Sensibility"), movie("2", "Hokum")), emptyList(), listOf(CatalogSeries(series("s", "Arcane"), 2, 18))),
        )
        compose.setContent { MavrosTheme { MavrosNavHost(container) } }
        compose.onNodeWithContentDescription("Buscar").performClick()
        return container
    }

    @Test fun `SRCH-04 lupa abre la busqueda con el campo enfocado y resultados al escribir`() {
        app()
        compose.onNodeWithTag("search-field").assertIsFocused().performTextInput("sensib")
        compose.onNodeWithText("Sense and Sensibility").assertIsDisplayed()
        compose.onNodeWithText("Hokum").assertDoesNotExist()
        compose.onNodeWithContentDescription("Borrar búsqueda").performClick()
        compose.onNodeWithTag("search-field").performTextInput("arca")
        compose.onNodeWithText("Arcane").performClick()
        // Abre la página de la serie
        compose.waitUntil { compose.onAllNodesWithTagExists("search-field").not() }
    }

    @Test fun `SRCH-03 REQ-03 sin resultados se pide lo escrito`() {
        val container = app()
        compose.onNodeWithTag("search-field").performTextInput("Matrix")
        compose.onNodeWithText("No encontramos «Matrix».").assertIsDisplayed()
        compose.onNodeWithTag("request").assertTextContains("Pedir «Matrix»").performClick()
        compose.onNodeWithTag("request-message").assertTextContains("Listo, se lo pedimos al admin.")
        assertEquals(listOf("Matrix"), container.requests.titles)
    }

    @Test fun `REQ-02 un pedido repetido se explica`() {
        val container = FakeContainer(auth = FakeAuthRepository(SessionState.SignedIn("u", "u@test")))
        container.requests.result = DataResult.Success(RequestResult.Duplicate)
        app(container)
        compose.onNodeWithTag("search-field").performTextInput("Matrix")
        compose.onNodeWithTag("request").performClick()
        compose.onNodeWithTag("request-message").assertTextContains("Ya lo pediste y sigue pendiente.")
    }

    private fun androidx.compose.ui.test.junit4.ComposeContentTestRule.onAllNodesWithTagExists(tag: String) =
        onAllNodes(androidx.compose.ui.test.hasTestTag(tag)).fetchSemanticsNodes().isNotEmpty()
}
