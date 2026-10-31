package com.mavros.archiver.tv

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performKeyInput
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.pressKey
import com.mavros.archiver.core.android.search.RequestState
import com.mavros.archiver.core.android.search.SearchUiState
import com.mavros.archiver.core.model.CatalogSeries
import com.mavros.archiver.core.model.Movie
import com.mavros.archiver.core.model.SearchHit
import com.mavros.archiver.core.model.Series
import com.mavros.archiver.tv.search.TvSearchScreen
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import kotlin.test.assertEquals

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], qualifiers = "w960dp-h540dp-television-xhdpi")
@OptIn(ExperimentalTestApi::class)
class TvSearchScreenTest {
    @get:Rule val compose = createComposeRule()

    private val hokum = Movie(id = "1", slug = "hokum", title = "Hokum", durationSeconds = 6000)
    private val arcane = CatalogSeries(Series(id = "s", slug = "arcane", title = "Arcane"), 2, 18)

    @Test fun `SRCH-05 el campo arranca enfocado, escribir busca y abajo se recorren los resultados`() {
        var state by mutableStateOf(SearchUiState(loading = false))
        val queries = mutableListOf<String>()
        val opened = mutableListOf<String>()
        compose.setContent {
            MavrosTvTheme {
                TvSearchScreen(state, onQuery = { queries += it; state = state.copy(query = it, results = listOf(SearchHit.MovieHit(hokum), SearchHit.SeriesHit(arcane))) },
                    onOpenMovie = { opened += "movie-$it" }, onOpenSeries = { opened += "series-$it" }, onRequest = {}, onRetry = {})
            }
        }
        compose.onNodeWithTag("tv-search-field").assertIsFocused().performTextInput("ho")
        assertEquals(listOf("ho"), queries)
        compose.onNodeWithTag("tv-card-s").assertIsDisplayed()
        compose.onRoot().performKeyInput { pressKey(Key.DirectionDown) }
        compose.onNodeWithTag("tv-card-1").assertIsFocused()
        compose.onRoot().performKeyInput { pressKey(Key.DirectionCenter) }
        compose.onRoot().performKeyInput { pressKey(Key.DirectionRight) }
        compose.onRoot().performKeyInput { pressKey(Key.DirectionCenter) }
        assertEquals(listOf("movie-1", "series-s"), opened)
    }

    @Test fun `SRCH-03 sin resultados ofrece pedir y muestra lo que respondio`() {
        var state by mutableStateOf(SearchUiState(query = "Matrix", loading = false))
        var requests = 0
        compose.setContent { MavrosTvTheme { TvSearchScreen(state, onQuery = {}, onOpenMovie = {}, onOpenSeries = {}, onRequest = { requests++ }, onRetry = {}) } }
        compose.onNodeWithText("No encontramos «Matrix».").assertIsDisplayed()
        compose.onRoot().performKeyInput { pressKey(Key.DirectionDown) }
        compose.onNodeWithTag("tv-request").assertIsFocused().assertTextContains("Pedir «Matrix»")
        compose.onRoot().performKeyInput { pressKey(Key.DirectionCenter) }
        assertEquals(1, requests)
        state = state.copy(request = RequestState.Sent)
        compose.onNodeWithTag("tv-request-message").assertTextContains("Listo, se lo pedimos al admin.")
        compose.onNodeWithTag("tv-request").assertDoesNotExist()
    }
}
