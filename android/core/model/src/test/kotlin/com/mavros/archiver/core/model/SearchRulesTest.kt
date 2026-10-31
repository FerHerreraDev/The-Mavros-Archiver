package com.mavros.archiver.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals

class SearchRulesTest {
    @Serializable data class Item(val title: String, @SerialName("original_title") val originalTitle: String? = null)
    @Serializable data class Case(val name: String, val items: List<Item>, val query: String, val expected: List<Int>)
    @Serializable data class Cases(val cases: List<Case>)

    private val shared by lazy {
        Json { ignoreUnknownKeys = true }.decodeFromString<Cases>(File(System.getProperty("mavros.fixtures"), "search-cases.json").readText())
    }

    @Test fun `SRCH-01 mismos casos que la web y el iPad`() {
        for (c in shared.cases) {
            assertEquals(c.expected.map { c.items[it] }, SearchRules.search(c.items, c.query) { listOf(it.title, it.originalTitle) }, c.name)
        }
    }

    @Test fun `SRCH-01 en el catalogo busca peliculas y series, nunca episodios sueltos`() {
        val film = Movie(id = "1", slug = "a", title = "Arcane la película", durationSeconds = 10)
        val episode = Movie(id = "2", slug = "b", title = "Arcane episodio", durationSeconds = 10, seriesId = "s", seasonNumber = 1, episodeNumber = 1)
        val show = CatalogSeries(Series(id = "s", slug = "arcane", title = "Arcane"), 1, 9)
        val hits = SearchRules.searchCatalog(Catalog(emptyList(), listOf(film, episode), emptyList(), listOf(show)), "arcane")
        assertEquals(listOf<SearchHit>(SearchHit.MovieHit(film), SearchHit.SeriesHit(show)), hits)
    }
}
