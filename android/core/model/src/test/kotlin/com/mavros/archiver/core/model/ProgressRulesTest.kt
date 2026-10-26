package com.mavros.archiver.core.model

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.double
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals

/** MOB-10: mismos casos que tests/unit/progress-parity.test.ts de la web */
class ProgressRulesTest {
    private val cases: JsonObject = Json.parseToJsonElement(
        File(System.getProperty("mavros.fixtures"), "progress-cases.json").readText()
    ).jsonObject

    @Test
    fun `resumePosition coincide con la web`() {
        val list = cases["resumePosition"]!!.jsonArray
        check(list.isNotEmpty())
        for (case in list.map { it.jsonObject }) {
            val position = case["position"]!!.jsonPrimitive.doubleOrNull
            val duration = case["duration"]!!.jsonPrimitive.int
            val expected = case["expected"]!!.jsonPrimitive.double
            assertEquals(expected, ProgressRules.resumePosition(position, duration), "resumePosition($position, $duration)")
        }
    }

    @Test
    fun `isInProgress coincide con la web`() {
        val list = cases["isInProgress"]!!.jsonArray
        check(list.isNotEmpty())
        for (case in list.map { it.jsonObject }) {
            val position = case["position"]!!.jsonPrimitive.double
            val duration = case["duration"]!!.jsonPrimitive.int
            val expected = case["expected"]!!.jsonPrimitive.boolean
            assertEquals(expected, ProgressRules.isInProgress(position, duration), "isInProgress($position, $duration)")
        }
    }

    @Test
    fun `progressRatio se limita a 0 a 1`() {
        assertEquals(0f, ProgressRules.progressRatio(-5.0, 100))
        assertEquals(0.5f, ProgressRules.progressRatio(50.0, 100))
        assertEquals(1f, ProgressRules.progressRatio(500.0, 100))
        assertEquals(0f, ProgressRules.progressRatio(5.0, 0))
    }
}
