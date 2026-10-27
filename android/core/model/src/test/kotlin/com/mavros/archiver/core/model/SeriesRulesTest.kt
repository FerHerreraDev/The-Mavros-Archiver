package com.mavros.archiver.core.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals

/** SER-13: mismos casos que tests/unit/series.test.ts de la web */
class SeriesRulesTest {
    @Serializable private data class Ref(val id: String, val season: Int, val episode: Int, val duration: Int)
    @Serializable private data class Progress(val movieId: String, val position: Double, val updatedAt: String)
    @Serializable private data class NextCase(val current: String, val expected: String?)
    @Serializable private data class UpExpected(val id: String, val action: String, val startAt: Double)
    @Serializable private data class UpCase(val name: String, val episodes: List<Ref>? = null, val progress: List<Progress>, val expected: UpExpected?)
    @Serializable private data class ContExpected(val id: String, val positionSeconds: Double, val updatedAt: String)
    @Serializable private data class ContCase(val name: String, val progress: List<Progress>, val expected: ContExpected?)
    @Serializable private data class Cases(
        val episodes: List<Ref>,
        val sorted: List<String>,
        val nextEpisode: List<NextCase>,
        val nextUp: List<UpCase>,
        val seriesContinue: List<ContCase>,
    )

    private val cases = Json { ignoreUnknownKeys = true }.decodeFromString<Cases>(
        File(System.getProperty("mavros.fixtures"), "series-cases.json").readText()
    )

    private fun movies(refs: List<Ref>) = refs.map {
        Movie(id = it.id, slug = it.id, title = it.id, durationSeconds = it.duration, seriesId = "s", seasonNumber = it.season, episodeNumber = it.episode)
    }
    private fun progress(list: List<Progress>) = list.map { EpisodeProgress(it.movieId, it.position, it.updatedAt) }
    private val episodes = movies(cases.episodes)

    @Test
    fun `orden de episodios coincide con la web`() {
        assertEquals(cases.sorted, SeriesRules.sortEpisodes(episodes).map { it.id })
    }

    @Test
    fun `siguiente episodio coincide con la web`() {
        check(cases.nextEpisode.isNotEmpty())
        for (c in cases.nextEpisode) assertEquals(c.expected, SeriesRules.nextEpisode(episodes, c.current)?.id, "siguiente de ${c.current}")
    }

    @Test
    fun `que sigue coincide con la web`() {
        check(cases.nextUp.isNotEmpty())
        for (c in cases.nextUp) {
            val result = SeriesRules.nextUp(c.episodes?.let(::movies) ?: episodes, progress(c.progress))
            val actual = result?.let { UpExpected(it.episode.id, it.action.name.lowercase(), it.startAt) }
            assertEquals(c.expected, actual, c.name)
        }
    }

    @Test
    fun `seguir viendo coincide con la web`() {
        check(cases.seriesContinue.isNotEmpty())
        for (c in cases.seriesContinue) {
            val result = SeriesRules.seriesContinue(episodes, progress(c.progress))
            assertEquals(c.expected, result?.let { ContExpected(it.episode.id, it.positionSeconds, it.updatedAt) }, c.name)
        }
    }

    @Test
    fun `etiquetas`() {
        assertEquals("T1:E2", episodeLabel(1, 2))
        assertEquals("Especiales", seasonName(0))
        assertEquals("Temporada 3", seasonName(3))
        val ep = episodes.first { it.id == "s1e2" }
        assertEquals("Continuar T1:E2 desde 6:40", NextUp(ep, NextUpAction.Continue, 400.0).label)
        assertEquals("Reproducir T1:E2", NextUp(ep, NextUpAction.Start, 0.0).label)
        assertEquals("Volver a ver T1:E2", NextUp(ep, NextUpAction.Rewatch, 0.0).label)
        assertEquals("2 temporadas", CatalogSeries(Series("x", "x", "x"), 2, 5).countLabel)
        assertEquals("1 episodio", CatalogSeries(Series("x", "x", "x"), 1, 1).countLabel)
        assertEquals("8 episodios", CatalogSeries(Series("x", "x", "x"), 1, 8).countLabel)
    }
}
