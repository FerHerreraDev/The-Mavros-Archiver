package com.mavros.archiver.core.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class PlaybackRulesTest {
    @Serializable data class Case(val name: String, val url: String, val expected: String)
    @Serializable data class Single(val latest: String, val url: String, val expected: String)
    @Serializable data class Cases(val latest: String, val cases: List<Case>, val latestWithoutToken: Single)

    private val shared by lazy {
        Json.decodeFromString<Cases>(File(System.getProperty("mavros.fixtures"), "swap-token-cases.json").readText())
    }

    @Test fun `MOB-16 swapToken - mismos casos que la web`() {
        assertTrue(shared.cases.size >= 5)
        for (c in shared.cases) assertEquals(c.expected, PlaybackRules.swapToken(c.url, shared.latest), c.name)
        with(shared.latestWithoutToken) { assertEquals(expected, PlaybackRules.swapToken(url, latest)) }
    }

    @Test fun `MOB-16 se renueva 5 min antes de caducar`() {
        val now = 1_000_000L
        assertEquals(55 * 60 * 1000L, PlaybackRules.refreshDelayMs(now + 60 * 60 * 1000L, now))
        assertEquals(0L, PlaybackRules.refreshDelayMs(now + 4 * 60 * 1000L, now), "faltan menos de 5 min: ya")
        assertEquals(0L, PlaybackRules.refreshDelayMs(now - 1, now), "ya caducó: ya")
    }
}

/** MOB-15 / PRG-01 / PRG-06 */
class ProgressTrackerTest {
    private val duration = 6000

    @Test fun `antes de arrancar nunca guarda (ni al salir)`() {
        val t = ProgressTracker(duration)
        assertNull(t.onTick(0.0, isPlaying = false, nowMs = 20_000))
        assertNull(t.onPause(0.0, 1_000))
        assertNull(t.onExit(0.0, 2_000), "salir antes de arrancar no pisa el progreso con 0")
        assertNull(t.onExit(754.0, 3_000), "posición sin haber reproducido (aún no salta al punto) no se guarda")
    }

    @Test fun `mientras reproduce guarda cada 10 s`() {
        val t = ProgressTracker(duration)
        t.onPlaying(0)
        assertNull(t.onTick(100.0, true, 5_000))
        assertNull(t.onTick(104.9, true, 9_999))
        assertEquals(110.0, t.onTick(110.0, true, 10_000))
        assertNull(t.onTick(115.0, true, 15_000))
        assertEquals(120.0, t.onTick(120.0, true, 20_000))
    }

    @Test fun `en pausa no guarda por tiempo`() {
        val t = ProgressTracker(duration)
        t.onPlaying(0)
        assertNull(t.onTick(100.0, isPlaying = false, nowMs = 60_000))
    }

    @Test fun `al pausar y al salir guarda la posicion exacta`() {
        val t = ProgressTracker(duration)
        t.onPlaying(0)
        assertEquals(123.456, t.onPause(123.456, 3_000))
        assertNull(t.onPause(123.456, 4_000), "misma posición: no repite")
        assertEquals(130.5, t.onExit(130.5, 11_000))
    }

    @Test fun `nunca guarda 0 ni fuera de la duracion`() {
        val t = ProgressTracker(duration)
        t.onPlaying(0)
        assertNull(t.onExit(0.0, 1_000))
        assertNull(t.onExit(-3.0, 1_000))
        assertNull(t.onExit(Double.NaN, 1_000))
        assertEquals(6000.0, t.onExit(6012.0, 2_000), "más allá del final se guarda el final")
    }

    @Test fun `guardar reinicia el reloj de 10 s`() {
        val t = ProgressTracker(duration)
        t.onPlaying(0)
        assertEquals(50.0, t.onPause(50.0, 8_000))
        t.onPlaying(8_000)
        assertNull(t.onTick(55.0, true, 17_000))
        assertEquals(60.0, t.onTick(60.0, true, 18_000))
    }
}
