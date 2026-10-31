package com.mavros.archiver.core.model

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class DownloadRulesTest {
    @Test fun `DL-01 la calidad mas cercana a 720p sin pasarse, o la mas baja`() {
        assertEquals(720, DownloadRules.pickHeight(listOf(1080, 720, 480, 360)))
        assertEquals(562, DownloadRules.pickHeight(listOf(782, 562, 374, 280)), "Hokum: 1782x782 es 'original', 562 la de 720")
        assertEquals(1080, DownloadRules.pickHeight(listOf(2160, 1080)))
        assertEquals(360, DownloadRules.pickHeight(listOf(360)))
        assertNull(DownloadRules.pickHeight(emptyList()))
        assertNull(DownloadRules.pickHeight(listOf(0, -1)))
    }

    @Test fun `DL-07 la clave de cache ignora el token`() {
        val a = "https://video.test/t/AAA.111/movies/hokum-v2/720p/seg_00001.ts"
        val b = "https://video.test/t/BBB.222/movies/hokum-v2/720p/seg_00001.ts"
        assertEquals("https://video.test/movies/hokum-v2/720p/seg_00001.ts", DownloadRules.cacheKey(a))
        assertEquals(DownloadRules.cacheKey(a), DownloadRules.cacheKey(b))
        assertEquals("https://video.test/movies/x/master.m3u8?v=1", DownloadRules.cacheKey("https://video.test/t/T/movies/x/master.m3u8?v=1"))
        // Lo que no es del Worker se deja igual
        assertEquals("https://otro.test/movies/x.ts", DownloadRules.cacheKey("https://otro.test/movies/x.ts"))
        assertEquals("no es url", DownloadRules.cacheKey("no es url"))
    }

    @Test fun `DL-07 carpeta de la pelicula sin token`() {
        assertEquals("https://video.test/movies/x/", DownloadRules.folderKey("https://video.test/t/T/movies/x/master.m3u8"))
        assertEquals("https://video.test/movies/x/720p/", DownloadRules.folderKey("https://video.test/t/T/movies/x/720p/index.m3u8"))
        assertNull(DownloadRules.folderKey("https://video.test/movies/x/master.m3u8"))
    }

    @Test fun `DL-05 el progreso sin internet solo pisa uno mas viejo`() {
        assertTrue(DownloadRules.shouldUpload(2_000, null))
        assertTrue(DownloadRules.shouldUpload(2_000, 1_000))
        assertFalse(DownloadRules.shouldUpload(1_000, 2_000))
        assertFalse(DownloadRules.shouldUpload(1_000, 1_000))
    }
}
