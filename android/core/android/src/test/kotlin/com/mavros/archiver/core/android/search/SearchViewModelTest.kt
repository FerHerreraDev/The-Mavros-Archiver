package com.mavros.archiver.core.android.search

import com.mavros.archiver.core.data.CatalogRepository
import com.mavros.archiver.core.data.DataError
import com.mavros.archiver.core.data.DataResult
import com.mavros.archiver.core.data.RequestRepository
import com.mavros.archiver.core.data.RequestResult
import com.mavros.archiver.core.model.Catalog
import com.mavros.archiver.core.model.CatalogSeries
import com.mavros.archiver.core.model.Movie
import com.mavros.archiver.core.model.MovieDetail
import com.mavros.archiver.core.model.SearchHit
import com.mavros.archiver.core.model.Series
import com.mavros.archiver.core.model.SeriesDetail
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class SearchViewModelTest {
    @Before fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())
    @After fun tearDown() = Dispatchers.resetMain()

    private val hokum = Movie(id = "1", slug = "hokum", title = "Hokum", durationSeconds = 10)
    private val sense = Movie(id = "2", slug = "sense", title = "Sense and Sensibility", originalTitle = "Juicio y sentimiento", durationSeconds = 10)
    private val arcane = CatalogSeries(Series(id = "s", slug = "arcane", title = "Arcane"), 2, 18)

    private class FakeCatalog(var result: DataResult<Catalog>) : CatalogRepository {
        val genres = mutableListOf<String?>()
        override suspend fun catalog(genre: String?): DataResult<Catalog> { genres += genre; return result }
        override suspend fun movie(id: String): DataResult<MovieDetail?> = DataResult.Success(null)
        override suspend fun series(id: String): DataResult<SeriesDetail?> = DataResult.Success(null)
        override suspend fun nextEpisode(movieId: String): DataResult<Movie?> = DataResult.Success(null)
    }

    private class FakeRequests(var result: DataResult<RequestResult> = DataResult.Success(RequestResult.Sent)) : RequestRepository {
        val titles = mutableListOf<String>()
        var gate: CompletableDeferred<Unit>? = null
        override suspend fun request(title: String): DataResult<RequestResult> { titles += title; gate?.await(); return result }
    }

    private fun vm(requests: FakeRequests = FakeRequests()) =
        SearchViewModel(FakeCatalog(DataResult.Success(Catalog(emptyList(), listOf(hokum, sense), emptyList(), listOf(arcane)))), requests)

    @Test fun `SRCH-04 resultados mientras escribes, con titulo original y series`() {
        val model = vm()
        assertEquals(emptyList(), model.state.value.results)
        model.onQuery("juicio")
        assertEquals(listOf<SearchHit>(SearchHit.MovieHit(sense)), model.state.value.results)
        model.onQuery("ARC")
        assertEquals(listOf<SearchHit>(SearchHit.SeriesHit(arcane)), model.state.value.results)
        assertFalse(model.state.value.noResults)
    }

    @Test fun `SRCH-03 sin resultados se ofrece pedir y el pedido usa lo escrito`() {
        val requests = FakeRequests().apply { gate = CompletableDeferred() }
        val model = vm(requests)
        model.onQuery("  ")
        assertFalse(model.state.value.noResults)
        model.onQuery("Matrix")
        assertTrue(model.state.value.noResults)
        model.request()
        model.request()
        assertEquals(RequestState.Sending, model.state.value.request)
        requests.gate!!.complete(Unit)
        assertEquals(listOf("Matrix"), requests.titles)
        assertEquals(RequestState.Sent, model.state.value.request)
        assertEquals("Listo, se lo pedimos al admin.", model.state.value.request.message())
        // Escribir otra cosa permite otro pedido
        model.onQuery("Matrix 2")
        assertEquals(RequestState.Idle, model.state.value.request)
    }

    @Test fun `REQ-02 duplicado, demasiados y error se explican`() {
        val requests = FakeRequests(DataResult.Success(RequestResult.Duplicate))
        val model = vm(requests)
        model.onQuery("Matrix")
        model.request()
        assertEquals("Ya lo pediste y sigue pendiente.", model.state.value.request.message())
        requests.result = DataResult.Success(RequestResult.TooMany)
        model.onQuery("Matrix 3")
        model.request()
        assertEquals(RequestState.TooMany, model.state.value.request)
        requests.result = DataResult.Failure(DataError.Network)
        model.onQuery("Matrix 4")
        model.request()
        assertEquals(RequestState.Failed, model.state.value.request)
    }

    @Test fun `MOB-09 sin red muestra error con Reintentar y no ofrece pedir`() {
        val catalog = FakeCatalog(DataResult.Failure(DataError.Network))
        val model = SearchViewModel(catalog, FakeRequests())
        model.onQuery("Hokum")
        assertEquals(DataError.Network, model.state.value.error)
        assertFalse(model.state.value.noResults)
        catalog.result = DataResult.Success(Catalog(emptyList(), listOf(hokum), emptyList()))
        model.retry()
        assertEquals(listOf<SearchHit>(SearchHit.MovieHit(hokum)), model.state.value.results)
        assertEquals(listOf<String?>(null, null), catalog.genres)
    }
}
