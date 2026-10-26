package com.mavros.archiver.core.model

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ModelsTest {
    @Test
    fun `formatDuration igual que la web`() {
        assertEquals("1 h 39 min", formatDuration(5952))
        assertEquals("1 h 0 min", formatDuration(3600))
        assertEquals("25 min", formatDuration(1500))
        assertEquals("22 s", formatDuration(22))
        assertEquals("59 s", formatDuration(59))
    }

    @Test
    fun `formatDurationShort para tarjetas`() {
        assertEquals("1h 39m", formatDurationShort(5952))
        assertEquals("25m", formatDurationShort(1500))
        assertEquals("22s", formatDurationShort(22))
    }

    @Test
    fun `formatTimestamp`() {
        assertEquals("0:09", formatTimestamp(9.9))
        assertEquals("12:34", formatTimestamp(754.2))
        assertEquals("1:02:05", formatTimestamp(3725.0))
    }
}

/** MOB-03: mismas reglas que loginSchema de la web */
class LoginValidationTest {
    @Test
    fun `email y contrasena validos`() {
        assertTrue(LoginValidation.validate("a@b.co", "12345678").isValid)
    }

    @Test
    fun `normaliza espacios y mayusculas`() {
        assertEquals("user@example.com", LoginValidation.normalizeEmail("  User@Example.COM "))
        assertTrue(LoginValidation.validate("  User@Example.COM ", "12345678").isValid)
    }

    @Test
    fun `emails invalidos`() {
        for (email in listOf("", "no-arroba", "a@b", "a @b.co", "@b.co", "a@.co")) {
            assertNotNull(LoginValidation.validate(email, "12345678").email, email)
        }
    }

    @Test
    fun `contrasena corta o vacia`() {
        assertNotNull(LoginValidation.validate("a@b.co", "1234567").password)
        assertNotNull(LoginValidation.validate("a@b.co", "").password)
        assertNull(LoginValidation.validate("a@b.co", "12345678").password)
    }
}
