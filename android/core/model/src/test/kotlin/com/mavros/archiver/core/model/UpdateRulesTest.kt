package com.mavros.archiver.core.model

import org.junit.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class UpdateRulesTest {
    private fun release(code: Int) = AppRelease(code, "1.$code", "a".repeat(64), "https://x.test/$code.apk")

    @Test fun `UPD-06 solo una version mayor obliga a actualizar`() {
        assertTrue(UpdateRules.needsUpdate(6, release(7)))
        assertFalse(UpdateRules.needsUpdate(6, release(6)))
        assertFalse(UpdateRules.needsUpdate(6, release(5)))
        assertFalse(UpdateRules.needsUpdate(6, null))
    }
}
