package com.mavros.archiver.core.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File
import java.util.Base64
import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.test.fail

/**
 * LOAD-04: los casos los generó la librería de referencia que usa la web
 * (scripts/gen-thumbhash-cases.mjs -> tests/fixtures/thumbhash/cases.json).
 */
class ThumbHashTest {
    @Serializable
    data class Avg(val r: Double, val g: Double, val b: Double, val a: Double)

    @Serializable
    data class Case(val name: String, val hash: String, val w: Int, val h: Int, val rgba: String, val average: Avg, val aspectRatio: Double)

    @Serializable
    data class Cases(val generatedBy: String, val cases: List<Case>)

    private val cases: List<Case> by lazy {
        val file = File(System.getProperty("mavros.fixtures"), "thumbhash/cases.json")
        Json.decodeFromString<Cases>(file.readText()).cases
    }

    @Test
    fun `hay casos de todo tipo (retrato, paisaje, alfa, 1x1)`() {
        assertTrue(cases.size >= 6)
        assertTrue(cases.any { it.w > it.h } && cases.any { it.h > it.w })
    }

    @Test
    fun `mismos pixeles que la web`() {
        for (case in cases) {
            val bytes = assertNotNull(ThumbHash.fromBase64(case.hash), case.name)
            val image = ThumbHash.toRgba(bytes)
            assertEquals(case.w, image.width, "${case.name}: ancho")
            assertEquals(case.h, image.height, "${case.name}: alto")
            val expected = Base64.getDecoder().decode(case.rgba)
            assertEquals(expected.size, image.rgba.size, case.name)
            // Mismo algoritmo en doble precisión: byte por byte idéntico
            for (i in expected.indices) {
                val diff = abs((expected[i].toInt() and 0xFF) - (image.rgba[i].toInt() and 0xFF))
                if (diff > 0) fail("${case.name}: byte $i difiere en $diff (web ${expected[i].toInt() and 0xFF}, android ${image.rgba[i].toInt() and 0xFF})")
            }
        }
    }

    @Test
    fun `mismo color promedio y proporcion que la web`() {
        for (case in cases) {
            val bytes = ThumbHash.fromBase64(case.hash)!!
            val avg = ThumbHash.averageRgba(bytes)
            assertEquals(case.average.r, avg.r.toDouble(), 1e-5, case.name)
            assertEquals(case.average.g, avg.g.toDouble(), 1e-5, case.name)
            assertEquals(case.average.b, avg.b.toDouble(), 1e-5, case.name)
            assertEquals(case.average.a, avg.a.toDouble(), 1e-5, case.name)
            assertEquals(case.aspectRatio, ThumbHash.approximateAspectRatio(bytes), 1e-9, case.name)
        }
    }

    @Test
    fun `el poster rojo-azul se ve rojo arriba y azul abajo`() {
        val case = cases.first { it.name == "poster-red-blue-png" }
        val image = ThumbHash.toRgba(ThumbHash.fromBase64(case.hash)!!)
        fun px(fx: Double, fy: Double): IntArray {
            val i = ((fy * image.height).toInt() * image.width + (fx * image.width).toInt()) * 4
            return IntArray(3) { image.rgba[i + it].toInt() and 0xFF }
        }
        val top = px(0.5, 0.1)
        val bottom = px(0.5, 0.9)
        assertTrue(top[0] > top[2] + 60, "arriba rojo: ${top.toList()}")
        assertTrue(bottom[2] > bottom[0] + 60, "abajo azul: ${bottom.toList()}")
    }

    @Test
    fun `hash ausente, vacio, no base64 o truncado - null (se queda el color de tarjeta)`() {
        for (value in listOf(null, "", "   ", "%%%", "AA==", "AAAA")) {
            assertNull(ThumbHash.fromBase64(value), "\"$value\"")
        }
    }

    @Test
    fun `hash con proporcion imposible - invalido, sin dividir entre cero`() {
        // Retrato (bit 15 apagado) con lx = 0 -> proporción 0
        assertFalse(ThumbHash.isValid(byteArrayOf(0, 0, 0, 0, 0)))
    }

    @Test
    fun `decodificar no depende de bytes de mas al final`() {
        val case = cases.first()
        val bytes = ThumbHash.fromBase64(case.hash)!!
        assertContentEquals(ThumbHash.toRgba(bytes).rgba, ThumbHash.toRgba(bytes + byteArrayOf(0, 0)).rgba)
    }
}
