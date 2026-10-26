package com.mavros.archiver.core.data

import com.mavros.archiver.core.model.Catalog
import com.mavros.archiver.core.model.ContinueItem
import com.mavros.archiver.core.model.Movie
import com.mavros.archiver.core.model.MovieDetail
import com.mavros.archiver.core.model.ProgressRules
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

interface CatalogRepository {
    suspend fun catalog(genre: String? = null): DataResult<Catalog>
    suspend fun movie(id: String): DataResult<MovieDetail?>
}

private const val CARD_FIELDS = "id, slug, title, release_year, duration_seconds, genres, poster_url, published_at, status"

@Serializable
private data class ProgressRow(
    @SerialName("position_seconds") val positionSeconds: Double,
    @SerialName("updated_at") val updatedAt: String,
    val movies: Movie,
)

/**
 * Mismas consultas y reglas que lib/data/catalog.ts de la web (MOB-07, MOB-08).
 * Todo pasa por RLS como el usuario con sesión.
 */
class SupabaseCatalogRepository(
    private val client: SupabaseClient,
    private val auth: AuthRepository,
) : CatalogRepository {

    override suspend fun catalog(genre: String?): DataResult<Catalog> = guarded {
        coroutineScope {
            // Siempre `published`, aunque sea admin: los borradores viven en el panel web
            val movies = async {
                client.from("movies").select(Columns.raw(CARD_FIELDS)) {
                    filter { eq("status", "published") }
                    order("published_at", Order.DESCENDING)
                }.decodeList<Movie>()
            }
            val progress = async {
                client.from("watch_progress").select(Columns.raw("position_seconds, updated_at, movies!inner($CARD_FIELDS)")) {
                    filter { eq("movies.status", "published") }
                    order("updated_at", Order.DESCENDING)
                }.decodeList<ProgressRow>()
            }

            val all = movies.await()
            Catalog(
                genres = all.flatMap { it.genres }.distinct().sortedWith(String.CASE_INSENSITIVE_ORDER),
                recent = if (genre == null) all else all.filter { genre in it.genres },
                continueWatching = progress.await()
                    .filter { ProgressRules.isInProgress(it.positionSeconds, it.movies.durationSeconds) }
                    .map { ContinueItem(it.movies, it.positionSeconds) },
            )
        }
    }

    /** null = no existe o este usuario no la puede ver (borrador ajeno) */
    override suspend fun movie(id: String): DataResult<MovieDetail?> = guarded {
        val movie = client.from("movies").select {
            filter { eq("id", id) }
        }.decodeSingleOrNull<Movie>() ?: return@guarded null

        val position = client.from("watch_progress").select(Columns.raw("position_seconds")) {
            filter { eq("movie_id", id) }
        }.decodeSingleOrNull<Map<String, Double>>()?.get("position_seconds")

        MovieDetail(movie, position)
    }

    private suspend fun <T> guarded(block: suspend () -> T): DataResult<T> = try {
        DataResult.Success(block())
    } catch (e: Throwable) {
        val error = e.toDataError()
        if (error == DataError.Unauthorized) auth.onUnauthorized()
        DataResult.Failure(error)
    }
}
