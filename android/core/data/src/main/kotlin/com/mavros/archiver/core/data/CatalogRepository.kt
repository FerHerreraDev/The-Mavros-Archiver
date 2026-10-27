package com.mavros.archiver.core.data

import com.mavros.archiver.core.model.Catalog
import com.mavros.archiver.core.model.CatalogSeries
import com.mavros.archiver.core.model.ContinueItem
import com.mavros.archiver.core.model.EpisodeProgress
import com.mavros.archiver.core.model.Movie
import com.mavros.archiver.core.model.MovieDetail
import com.mavros.archiver.core.model.ProgressRules
import com.mavros.archiver.core.model.Series
import com.mavros.archiver.core.model.SeriesDetail
import com.mavros.archiver.core.model.SeriesRules
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

interface CatalogRepository {
    suspend fun catalog(genre: String? = null): DataResult<Catalog>
    suspend fun movie(id: String): DataResult<MovieDetail?>
    /** Serie con episodios, progreso y qué sigue (SER-09, SER-10). null = no existe o no la puede ver. */
    suspend fun series(id: String): DataResult<SeriesDetail?>
    /** Siguiente episodio publicado de la misma serie (SER-12, SER-16); null si no hay o es película */
    suspend fun nextEpisode(movieId: String): DataResult<Movie?>
}

private const val CARD_FIELDS = "id, slug, title, release_year, duration_seconds, genres, poster_url, poster_image_url, poster_thumbhash, published_at, status, series_id, season_number, episode_number"
/** Episodios en la página de la serie: además su sinopsis (SER-18) */
private const val EPISODE_FIELDS = "$CARD_FIELDS, synopsis"
private const val SERIES_FIELDS = "id, slug, title, release_year, genres, poster_url, poster_image_url, poster_thumbhash, published_at, status"

@Serializable
private data class ProgressEntry(
    @SerialName("movie_id") val movieId: String,
    @SerialName("position_seconds") val positionSeconds: Double,
    @SerialName("updated_at") val updatedAt: String,
)

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
            // Siempre `published`, aunque sea admin: los borradores viven en el panel web.
            // Películas y episodios en una sola consulta; los episodios se agrupan por serie (SER-08)
            val movies = async {
                client.from("movies").select(Columns.raw(CARD_FIELDS)) {
                    filter { eq("status", "published") }
                    order("published_at", Order.DESCENDING)
                }.decodeList<Movie>()
            }
            val series = async {
                client.from("series").select(Columns.raw(SERIES_FIELDS)) {
                    filter { eq("status", "published") }
                    order("published_at", Order.DESCENDING)
                }.decodeList<Series>()
            }
            val progress = async {
                client.from("watch_progress").select(Columns.raw("position_seconds, updated_at, movies!inner($CARD_FIELDS)")) {
                    filter { eq("movies.status", "published") }
                    order("updated_at", Order.DESCENDING)
                }.decodeList<ProgressRow>()
            }

            val (episodes, films) = movies.await().partition { it.isEpisode }
            val episodesBySeries = episodes.groupBy { it.seriesId!! }
            val shows = series.await().filter { it.id in episodesBySeries }.map { show ->
                val list = episodesBySeries.getValue(show.id)
                CatalogSeries(show, list.mapNotNull { it.seasonNumber }.distinct().size, list.size)
            }
            val showsById = shows.associateBy { it.series.id }
            val rows = progress.await()

            // Seguir viendo: películas a medias (CAT-06) + una entrada por serie (SER-11), por última vez vista
            val continueFilms = rows
                .filter { !it.movies.isEpisode && ProgressRules.isInProgress(it.positionSeconds, it.movies.durationSeconds) }
                .map { ContinueItem(it.movies, it.positionSeconds) to it.updatedAt }
            val continueShows = rows.filter { it.movies.isEpisode && it.movies.seriesId in showsById }
                .groupBy { it.movies.seriesId!! }
                .mapNotNull { (seriesId, entries) ->
                    val entry = SeriesRules.seriesContinue(
                        episodesBySeries.getValue(seriesId),
                        entries.map { EpisodeProgress(it.movies.id, it.positionSeconds, it.updatedAt) },
                    ) ?: return@mapNotNull null
                    ContinueItem(entry.episode, entry.positionSeconds, showsById.getValue(seriesId).series) to entry.updatedAt
                }

            fun <T> byGenre(list: List<T>, genres: (T) -> List<String>) = if (genre == null) list else list.filter { genre in genres(it) }
            Catalog(
                genres = (films.flatMap { it.genres } + shows.flatMap { it.series.genres }).distinct().sortedWith(String.CASE_INSENSITIVE_ORDER),
                recent = byGenre(films) { it.genres },
                continueWatching = (continueFilms + continueShows)
                    .sortedByDescending { SeriesRules.instantOf(it.second) }
                    .map { it.first },
                series = byGenre(shows) { it.series.genres },
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

        val series = movie.seriesId?.let { id ->
            client.from("series").select(Columns.raw(SERIES_FIELDS)) { filter { eq("id", id) } }.decodeSingleOrNull<Series>()
        }
        MovieDetail(movie, position, series)
    }

    override suspend fun series(id: String): DataResult<SeriesDetail?> = guarded {
        val series = client.from("series").select { filter { eq("id", id) } }.decodeSingleOrNull<Series>() ?: return@guarded null
        val episodes = SeriesRules.sortEpisodes(
            client.from("movies").select(Columns.raw(EPISODE_FIELDS)) { filter { eq("series_id", id) } }.decodeList<Movie>()
        )
        val progress = if (episodes.isEmpty()) emptyList() else {
            client.from("watch_progress").select(Columns.raw("movie_id, position_seconds, updated_at")) {
                filter { isIn("movie_id", episodes.map { it.id }) }
            }.decodeList<ProgressEntry>().map { EpisodeProgress(it.movieId, it.positionSeconds, it.updatedAt) }
        }
        SeriesDetail(
            series = series,
            episodes = episodes,
            progress = progress.associate { it.movieId to it.position },
            // Qué sigue solo entre los publicados: lo que vería cualquier usuario (igual que la web)
            next = SeriesRules.nextUp(episodes.filter { it.status == "published" }, progress),
        )
    }

    override suspend fun nextEpisode(movieId: String): DataResult<Movie?> = guarded {
        val movie = client.from("movies").select(Columns.raw(CARD_FIELDS)) { filter { eq("id", movieId) } }.decodeSingleOrNull<Movie>()
        val seriesId = movie?.seriesId ?: return@guarded null
        val episodes = client.from("movies").select(Columns.raw(CARD_FIELDS)) { filter { eq("series_id", seriesId) } }.decodeList<Movie>()
        // El siguiente solo entre los publicados (un admin en vista previa no salta a otro borrador)
        SeriesRules.nextEpisode(episodes.filter { it.status == "published" || it.id == movieId }, movieId)
    }

    private suspend fun <T> guarded(block: suspend () -> T): DataResult<T> = try {
        DataResult.Success(block())
    } catch (e: CancellationException) {
        // Cancelar no es un error: la pantalla pidió otra carga (MOB-12)
        throw e
    } catch (e: Throwable) {
        val error = e.toDataError()
        if (error == DataError.Unauthorized) auth.onUnauthorized()
        DataResult.Failure(error)
    }
}
