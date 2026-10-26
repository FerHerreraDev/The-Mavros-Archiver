package com.mavros.archiver.mobile

import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTextInput
import com.mavros.archiver.core.data.DataError
import com.mavros.archiver.core.data.SessionState
import com.mavros.archiver.core.design.MavrosTheme
import com.mavros.archiver.core.model.Catalog
import com.mavros.archiver.core.model.ContinueItem
import com.mavros.archiver.core.model.MovieDetail
import com.mavros.archiver.mobile.catalog.CatalogContent
import com.mavros.archiver.mobile.catalog.CatalogUiState
import com.mavros.archiver.mobile.detail.DetailContent
import com.mavros.archiver.mobile.detail.DetailUiState
import com.mavros.archiver.mobile.login.LoginContent
import com.mavros.archiver.mobile.login.LoginUiState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import kotlin.test.assertEquals

@RunWith(RobolectricTestRunner::class)
class ScreensTest {
    @get:Rule val compose = createComposeRule()

    private fun content(block: @androidx.compose.runtime.Composable () -> Unit) = compose.setContent { MavrosTheme { block() } }

    @Test fun `MOB-03 login - boton deshabilitado sin datos, error visible`() {
        content { LoginContent(LoginUiState(error = "Email o contraseña incorrectos."), {}, {}, {}) }
        compose.onNodeWithTag("submit").assertIsNotEnabled()
        compose.onNodeWithTag("login-error").assertTextContains("Email o contraseña incorrectos.")
    }

    @Test fun `MOB-03 login - con datos el boton se habilita y envia`() {
        var submitted = 0
        content { LoginContent(LoginUiState(email = "a@b.co", password = "12345678"), {}, {}, { submitted++ }) }
        compose.onNodeWithTag("submit").assertIsEnabled().performClick()
        assertEquals(1, submitted)
    }

    @Test fun `MOB-03 login - lo que se escribe llega al ViewModel`() {
        // Estado real, como lo mantiene el ViewModel (si fuera fijo, Compose devolvería el campo a vacío)
        var state by mutableStateOf(LoginUiState())
        content { LoginContent(state, { state = state.copy(email = it) }, { state = state.copy(password = it) }, {}) }
        compose.onNodeWithTag("email").performTextInput("a@b.co")
        compose.onNodeWithTag("password").performTextInput("secreto123")
        assertEquals("a@b.co", state.email)
        assertEquals("secreto123", state.password)
        compose.onNodeWithTag("submit").assertIsEnabled()
    }

    @Test fun `MOB-07 catalogo - seguir viendo con barra de progreso, recientes y generos`() {
        val catalog = Catalog(
            genres = listOf("anime"),
            recent = listOf(movie("1", "Akira")),
            continueWatching = listOf(ContinueItem(movie("3", "Chainsaw Man", duration = 6000), 3000.0)),
        )
        content { CatalogContent(CatalogUiState.Content(catalog, null), {}, {}, {}, {}) }
        compose.onNodeWithText("Seguir viendo").assertIsDisplayed()
        compose.onNodeWithTag("progress-3", useUnmergedTree = true).assert(SemanticsMatcher.expectValue(SemanticsProperties.ProgressBarRangeInfo, ProgressBarRangeInfo(0.5f, 0f..1f)))
        compose.onNodeWithText("Anime").assertIsDisplayed()
        // La cuadrícula es lazy: el usuario baja para ver las recientes
        compose.onNodeWithTag("catalog").performScrollToNode(hasTestTag("poster-1"))
        compose.onNodeWithTag("poster-1").assertIsDisplayed()
    }

    @Test fun `MOB-07 catalogo - sin pendientes no aparece seguir viendo`() {
        content { CatalogContent(CatalogUiState.Content(Catalog(emptyList(), listOf(movie("1")), emptyList()), null), {}, {}, {}, {}) }
        compose.onNodeWithText("Seguir viendo").assertDoesNotExist()
    }

    @Test fun `MOB-07 catalogo - elegir genero y abrir pelicula`() {
        val events = mutableListOf<String>()
        val catalog = Catalog(listOf("anime"), listOf(movie("1", "Akira")), emptyList())
        content { CatalogContent(CatalogUiState.Content(catalog, null), { events += "open:$it" }, {}, { events += "genre:$it" }, {}) }
        compose.onNodeWithText("Anime").performClick()
        compose.onNodeWithTag("poster-1").performClick()
        assertEquals(listOf("genre:anime", "open:1"), events)
    }

    @Test fun `MOB-07 catalogo - genero sin peliculas muestra estado vacio`() {
        content { CatalogContent(CatalogUiState.Content(Catalog(listOf("anime"), emptyList(), emptyList()), "anime"), {}, {}, {}, {}) }
        compose.onNodeWithTag("empty").assertIsDisplayed()
        compose.onNodeWithText("No hay películas de \"anime\" todavía.").assertIsDisplayed()
    }

    @Test fun `MOB-09 error con reintentar`() {
        var retries = 0
        content { CatalogContent(CatalogUiState.Error(DataError.Network), {}, {}, {}, { retries++ }) }
        compose.onNodeWithText("Sin conexión. Revisa tu internet.").assertIsDisplayed()
        compose.onNodeWithText("Reintentar").performClick()
        assertEquals(1, retries)
    }

    @Test fun `MOB-08 detalle - datos y boton continuar`() {
        val m = movie("1", "Akira", duration = 7440, genres = listOf("anime"), year = 1988)
        var playedFrom = -1.0
        content { DetailContent(DetailUiState.Content(MovieDetail(m, 754.0)), {}, { playedFrom = it }, {}) }
        compose.onNodeWithTag("title").assertTextContains("Akira")
        compose.onNodeWithTag("meta").assertTextContains("1988 · 2 H 4 MIN · ANIME")
        compose.onNodeWithTag("synopsis").assertIsDisplayed()
        compose.onNodeWithText("Continuar desde 12:34").performClick()
        assertEquals(754.0, playedFrom)
    }

    @Test fun `MOB-08 detalle no disponible`() {
        content { DetailContent(DetailUiState.NotAvailable, {}, {}, {}) }
        compose.onNodeWithText("Esta película no está disponible.").assertIsDisplayed()
    }

    @Test fun `MOB-05 MOB-06 la navegacion sigue a la sesion - login, catalogo y de vuelta al login`() {
        val container = FakeContainer(auth = FakeAuthRepository(SessionState.SignedOut))
        content { MavrosNavHost(container) }
        compose.onNodeWithTag("submit").assertIsDisplayed()

        container.auth.state.value = SessionState.SignedIn("user-1", "a@b.co")
        compose.waitForIdle()
        compose.onNodeWithTag("catalog").assertIsDisplayed()

        // Sesión perdida (logout o revocada): vuelve al login sin que nadie navegue
        container.auth.state.value = SessionState.SignedOut
        compose.waitForIdle()
        compose.onNodeWithTag("submit").assertIsDisplayed()
    }

    @Test fun `MOB-05 cerrar sesion desde el perfil vuelve al login`() {
        val container = FakeContainer(auth = FakeAuthRepository(SessionState.SignedIn("user-1", "a@b.co")))
        content { MavrosNavHost(container) }
        compose.onNodeWithText("Perfil", useUnmergedTree = true).assertDoesNotExist()
        compose.onNode(SemanticsMatcher.expectValue(SemanticsProperties.ContentDescription, listOf("Perfil"))).performClick()
        compose.onNodeWithTag("profile-email").assertTextContains("a@b.co")
        compose.onNodeWithTag("sign-out").performClick()
        compose.waitForIdle()
        compose.onNodeWithTag("submit").assertIsDisplayed()
    }
}
