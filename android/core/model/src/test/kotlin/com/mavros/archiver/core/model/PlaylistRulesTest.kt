package com.mavros.archiver.core.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals

/** PL-05 / PL-06: mismos casos que tests/unit/playlist.test.ts de la web */
class PlaylistRulesTest {
    @Serializable private data class Ref(val id: String, val season: Int, val episode: Int, val duration: Int)
    @Serializable private data class Progress(val movieId: String, val position: Double, val updatedAt: String)
    @Serializable private data class Expected(val id: String, val startAt: Double)
    @Serializable private data class StartCase(val name: String, val entries: List<String>? = null, val progress: List<Progress>, val expected: Expected?)
    @Serializable private data class NextCase(val name: String, val current: String, val progress: List<Progress>, val expected: Expected?)
    @Serializable private data class Cases(
        val movies: List<Ref>,
        val series: Map<String, List<Ref>>,
        val entries: List<String>,
        val start: List<StartCase>,
        val next: List<NextCase>,
    )

    private val cases = Json { ignoreUnknownKeys = true }.decodeFromString<Cases>(
        File(System.getProperty("mavros.fixtures"), "playlist-cases.json").readText()
    )

    private fun movie(r: Ref, seriesId: String?) =
        Movie(id = r.id, slug = r.id, title = r.id, durationSeconds = r.duration, seriesId = seriesId, seasonNumber = seriesId?.let { r.season }, episodeNumber = seriesId?.let { r.episode })

    private fun entries(keys: List<String>): List<ListEntry> = keys.map { key ->
        cases.series[key]?.let { eps -> ListEntry.SeriesEntry(key, eps.map { movie(it, key) }) }
            ?: ListEntry.MovieEntry(movie(cases.movies.first { it.id == key }, null))
    }

    private fun progress(list: List<Progress>) = list.map { EpisodeProgress(it.movieId, it.position, it.updatedAt) }
    private fun ListPick?.simple() = this?.let { Expected(it.episode.id, it.startAt) }

    @Test
    fun `reproducir lista coincide con la web`() {
        check(cases.start.isNotEmpty())
        for (c in cases.start) assertEquals(c.expected, PlaylistRules.start(entries(c.entries ?: cases.entries), progress(c.progress)).simple(), c.name)
    }

    @Test
    fun `siguiente en la lista coincide con la web`() {
        check(cases.next.isNotEmpty())
        for (c in cases.next) assertEquals(c.expected, PlaylistRules.next(entries(cases.entries), c.current, progress(c.progress)).simple(), c.name)
    }
}
