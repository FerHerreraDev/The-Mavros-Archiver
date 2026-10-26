package com.mavros.archiver.mobile

import com.mavros.archiver.core.data.AuthRepository
import com.mavros.archiver.core.data.CatalogRepository
import com.mavros.archiver.core.data.DataResult
import com.mavros.archiver.core.data.LoginError
import com.mavros.archiver.core.data.SessionState
import com.mavros.archiver.core.model.Catalog
import com.mavros.archiver.core.model.ContinueItem
import com.mavros.archiver.core.model.Movie
import com.mavros.archiver.core.model.MovieDetail
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

fun movie(id: String, title: String = "Película $id", duration: Int = 6000, genres: List<String> = emptyList(), year: Int? = 2025) =
    Movie(id = id, slug = "slug-$id", title = title, durationSeconds = duration, genres = genres, releaseYear = year, synopsis = "Sinopsis de $title")

class FakeAuthRepository(initial: SessionState = SessionState.SignedOut) : AuthRepository {
    val state = MutableStateFlow(initial)
    override val session: StateFlow<SessionState> = state
    var nextSignInError: LoginError? = null
    val signInCalls = mutableListOf<Pair<String, String>>()
    var validateResult = true

    override suspend fun signIn(email: String, password: String): LoginError? {
        signInCalls += email to password
        if (nextSignInError == null) state.value = SessionState.SignedIn("user-1", email)
        return nextSignInError
    }

    override suspend fun signOut() {
        state.value = SessionState.SignedOut
    }

    override suspend fun validateSession(): Boolean {
        if (!validateResult) state.value = SessionState.SignedOut
        return validateResult
    }

    override suspend fun onUnauthorized() {
        validateSession()
    }
}

class FakeCatalogRepository : CatalogRepository {
    var catalogResult: DataResult<Catalog> = DataResult.Success(
        Catalog(
            genres = listOf("acción", "anime"),
            recent = listOf(movie("1", "Akira", genres = listOf("anime")), movie("2", "Perfect Blue", genres = listOf("anime"))),
            continueWatching = listOf(ContinueItem(movie("3", "Chainsaw Man"), 3000.0)),
        ),
    )
    val requestedGenres = mutableListOf<String?>()
    var detailResult: DataResult<MovieDetail?> = DataResult.Success(MovieDetail(movie("1", "Akira"), null))

    override suspend fun catalog(genre: String?): DataResult<Catalog> {
        requestedGenres += genre
        return catalogResult
    }

    override suspend fun movie(id: String): DataResult<MovieDetail?> = detailResult
}

class FakeContainer(
    override val auth: FakeAuthRepository = FakeAuthRepository(),
    override val catalog: FakeCatalogRepository = FakeCatalogRepository(),
) : AppContainer {
    override val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined)
}
