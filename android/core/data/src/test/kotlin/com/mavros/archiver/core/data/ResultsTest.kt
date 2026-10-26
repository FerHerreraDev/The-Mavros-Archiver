package com.mavros.archiver.core.data

import io.github.jan.supabase.exceptions.HttpRequestException
import java.io.IOException
import java.net.ConnectException
import java.net.UnknownHostException
import kotlin.test.Test
import kotlin.test.assertEquals

/** MOB-09: qué error ve la UI según lo que falle */
class ResultsTest {
    @Test fun `sin red o servidor inalcanzable - Network`() {
        assertEquals(DataError.Network, IOException("reset").toDataError())
        assertEquals(DataError.Network, ConnectException("refused").toDataError())
        assertEquals(DataError.Network, UnknownHostException("no dns").toDataError())
        assertEquals(DataError.Network, HttpRequestException("timeout", io.ktor.client.request.HttpRequestBuilder()).toDataError())
    }

    @Test fun `cualquier otra cosa - Server, nunca se propaga como excepcion`() {
        assertEquals(DataError.Server, IllegalStateException("boom").toDataError())
        assertEquals(DataError.Server, kotlinx.serialization.SerializationException("bad json").toDataError())
    }
}
