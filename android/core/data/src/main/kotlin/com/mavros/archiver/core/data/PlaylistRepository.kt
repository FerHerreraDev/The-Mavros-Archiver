package com.mavros.archiver.core.data

import com.mavros.archiver.core.model.EpisodeProgress
import com.mavros.archiver.core.model.ListEntry
import com.mavros.archiver.core.model.ListPick
import com.mavros.archiver.core.model.Movie
import com.mavros.archiver.core.model.Playlist
import com.mavros.archiver.core.model.PlaylistDetail
import com.mavros.archiver.core.model.PlaylistItem
import com.mavros.archiver.core.model.PlaylistMembership
import com.mavros.archiver.core.model.PlaylistRules
import com.mavros.archiver.core.model.PlaylistSummary
import com.mavros.archiver.core.model.PlaylistTarget
import com.mavros.archiver.core.model.Series
import com.mavros.archiver.core.model.SeriesRules
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/** Listas personales (PL-07). Todo con la sesión del usuario: RLS garantiza que solo toca las suyas. */
interface PlaylistRepository {
    suspend fun lists(): DataResult<List<PlaylistSummary>>
    /** null = no es mía o no existe */
    suspend fun playlist(id: String): DataResult<PlaylistDetail?>
    suspend fun membership(target: PlaylistTarget): DataResult<List<PlaylistMembership>>
    /** Agrega si no estaba, quita si estaba. true = quedó agregado */
    suspend fun toggle(playlistId: String, target: PlaylistTarget): DataResult<Boolean>
    /** Crea una lista y le agrega [add]; devuelve su id */
    suspend fun create(name: String, add: PlaylistTarget? = null): DataResult<String>
    /** Lo que sigue en la lista al terminar [movieId] (PL-06) */
    suspend fun next(playlistId: String, movieId: String): DataResult<ListPick?>
}

private const val CARD_FIELDS = "id, slug, title, release_year, duration_seconds, genres, poster_url, poster_image_url, poster_thumbhash, published_at, status, series_id, season_number, episode_number"
private const val SERIES_FIELDS = "id, slug, title, release_year, genres, poster_url, poster_image_url, poster_thumbhash, published_at, status"

@Serializable private data class Count(val count: Int)
@Serializable private data class ListRow(val id: String, val name: String, @SerialName("created_at") val createdAt: String? = null, @SerialName("playlist_items") val items: List<Count> = emptyList())
@Serializable private data class ItemRow(val id: String, val position: Int, val movie: Movie? = null, val series: Series? = null)
@Serializable private data class Progress(@SerialName("movie_id") val movieId: String, @SerialName("position_seconds") val position: Double, @SerialName("updated_at") val updatedAt: String)

class SupabasePlaylistRepository(private val client: SupabaseClient, private val auth: AuthRepository) : PlaylistRepository {

    override suspend fun lists() = guarded {
        client.from("playlists").select(Columns.raw("id, name, created_at, playlist_items(count)")) { order("created_at", Order.ASCENDING) }
            .decodeList<ListRow>()
            .map { PlaylistSummary(Playlist(it.id, it.name, it.createdAt), it.items.firstOrNull()?.count ?: 0) }
    }

    override suspend fun playlist(id: String) = guarded {
        val list = client.from("playlists").select(Columns.raw("id, name, created_at")) { filter { eq("id", id) } }.decodeSingleOrNull<Playlist>()
            ?: return@guarded null
        val items = items(id)
        val (entries, progress) = resolve(items)
        PlaylistDetail(list, items, PlaylistRules.start(entries, progress))
    }

    override suspend fun membership(target: PlaylistTarget) = guarded {
        val (column, value) = target.column()
        val lists = client.from("playlists").select(Columns.raw("id, name, created_at")) { order("created_at", Order.ASCENDING) }.decodeList<Playlist>()
        val inLists = client.from("playlist_items").select(Columns.raw("playlist_id")) { filter { eq(column, value) } }
            .decodeList<JsonObject>().map { it["playlist_id"]!!.jsonPrimitive.content }.toSet()
        lists.map { PlaylistMembership(it, it.id in inLists) }
    }

    override suspend fun toggle(playlistId: String, target: PlaylistTarget) = guarded {
        val (column, value) = target.column()
        val removed = client.from("playlist_items").delete {
            select()
            filter { eq("playlist_id", playlistId); eq(column, value) }
        }.decodeList<JsonObject>()
        if (removed.isNotEmpty()) return@guarded false
        client.from("playlist_items").insert(buildJsonObject { put("playlist_id", playlistId); put(column, value) })
        true
    }

    override suspend fun create(name: String, add: PlaylistTarget?) = guarded {
        val id = client.from("playlists").insert(buildJsonObject { put("name", name.trim()) }) { select(Columns.raw("id")) }
            .decodeSingle<JsonObject>()["id"]!!.jsonPrimitive.content
        add?.let { toggle(id, it) }
        id
    }

    override suspend fun next(playlistId: String, movieId: String) = guarded {
        val (entries, progress) = resolve(items(playlistId))
        PlaylistRules.next(entries, movieId, progress)
    }

    /** RLS: lo que dejó de estar publicado llega como null y no se muestra (PL-05) */
    private suspend fun items(playlistId: String): List<PlaylistItem> =
        client.from("playlist_items").select(Columns.raw("id, position, movie:movies($CARD_FIELDS), series:series($SERIES_FIELDS)")) {
            filter { eq("playlist_id", playlistId) }
            order("position", Order.ASCENDING)
        }.decodeList<ItemRow>()
            .filter { (it.movie != null && it.movie.status == "published") || it.series != null }
            .map { PlaylistItem(it.id, it.position, it.movie, it.series) }

    /** Elementos resueltos para las reglas: episodios publicados de cada serie y mi progreso */
    private suspend fun resolve(items: List<PlaylistItem>): Pair<List<ListEntry>, List<EpisodeProgress>> {
        val seriesIds = items.mapNotNull { it.series?.id }
        val episodes = if (seriesIds.isEmpty()) emptyList() else {
            client.from("movies").select(Columns.raw(CARD_FIELDS)) { filter { isIn("series_id", seriesIds); eq("status", "published") } }.decodeList<Movie>()
        }
        val ids = items.mapNotNull { it.movie?.id } + episodes.map { it.id }
        val progress = if (ids.isEmpty()) emptyList() else {
            client.from("watch_progress").select(Columns.raw("movie_id, position_seconds, updated_at")) { filter { isIn("movie_id", ids) } }
                .decodeList<Progress>().map { EpisodeProgress(it.movieId, it.position, it.updatedAt) }
        }
        val entries = items.map { item ->
            item.movie?.let { ListEntry.MovieEntry(it) }
                ?: item.series!!.let { show -> ListEntry.SeriesEntry(show.id, SeriesRules.sortEpisodes(episodes.filter { it.seriesId == show.id })) }
        }
        return entries to progress
    }

    private fun PlaylistTarget.column() = when (this) {
        is PlaylistTarget.MovieTarget -> "movie_id" to movieId
        is PlaylistTarget.SeriesTarget -> "series_id" to seriesId
    }

    private suspend fun <T> guarded(block: suspend () -> T): DataResult<T> = try {
        DataResult.Success(block())
    } catch (e: CancellationException) {
        throw e
    } catch (e: Throwable) {
        val error = e.toDataError()
        if (error == DataError.Unauthorized) auth.onUnauthorized()
        DataResult.Failure(error)
    }
}
