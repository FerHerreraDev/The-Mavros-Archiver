package com.mavros.archiver.core.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals

class TrackRulesTest {
    @Serializable data class Case(val name: String, val tracks: List<String?>, val saved: String?, val expected: Int)
    @Serializable data class Cases(val cases: List<Case>)

    private val shared by lazy {
        Json.decodeFromString<Cases>(File(System.getProperty("mavros.fixtures"), "track-cases.json").readText())
    }

    @Test fun `MOB-20 idioma recordado - mismos casos que la web`() {
        for (c in shared.cases) assertEquals(c.expected, TrackRules.pick(c.tracks, c.saved), c.name)
    }

    @Test fun `MOB-20 un idioma por opcion con el nombre del master`() {
        val tracks = listOf("es" to "Español", "en" to "Inglés", "es" to "Español", "und" to null, null to "Sin idioma", "ja" to null)
        assertEquals(
            listOf(TrackOption("es", "Español"), TrackOption("en", "Inglés"), TrackOption("ja", "ja")),
            TrackRules.options(tracks),
        )
    }
}
