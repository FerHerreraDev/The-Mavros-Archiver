package com.mavros.archiver.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Lista personal (PL-01) */
@Serializable
data class Playlist(
    val id: String,
    val name: String,
    @SerialName("created_at") val createdAt: String? = null,
)

data class PlaylistSummary(val playlist: Playlist, val count: Int)

/** Elemento de la lista: una película/episodio o una serie (PL-02) */
data class PlaylistItem(val id: String, val position: Int, val movie: Movie?, val series: Series?) {
    val poster: HasPoster get() = movie ?: series!!
    val title: String get() = movie?.title ?: series!!.title
}

/** Una lista con mis listas marcadas: "Agregar a lista" (PL-04) */
data class PlaylistMembership(val playlist: Playlist, val contains: Boolean)

/** Lo que se agrega a una lista */
sealed interface PlaylistTarget {
    data class MovieTarget(val movieId: String) : PlaylistTarget
    data class SeriesTarget(val seriesId: String) : PlaylistTarget
}

/** Elemento ya resuelto para las reglas: una película, o una serie con sus episodios visibles */
sealed interface ListEntry {
    data class MovieEntry(val movie: Movie) : ListEntry
    data class SeriesEntry(val seriesId: String, val episodes: List<Movie>) : ListEntry
}

/** Qué se reproduce y desde dónde */
data class ListPick(val episode: Movie, val startAt: Double)

data class PlaylistDetail(val playlist: Playlist, val items: List<PlaylistItem>, val start: ListPick?)

/**
 * Reglas de listas (PL-05, PL-06). Deben dar lo mismo que lib/playlist.ts de la web:
 * las dos implementaciones se prueban con tests/fixtures/playlist-cases.json.
 */
object PlaylistRules {
    /** "Reproducir lista": el primer elemento que tenga algo que ver */
    fun start(entries: List<ListEntry>, progress: List<EpisodeProgress>): ListPick? =
        entries.firstNotNullOfOrNull { entryStart(it, progress) }

    /** Lo que sigue al terminar [currentId]: dentro de una serie de la lista, su siguiente episodio; si no, el siguiente elemento */
    fun next(entries: List<ListEntry>, currentId: String, progress: List<EpisodeProgress>): ListPick? {
        val i = entries.indexOfFirst {
            when (it) {
                is ListEntry.MovieEntry -> it.movie.id == currentId
                is ListEntry.SeriesEntry -> it.episodes.any { ep -> ep.id == currentId }
            }
        }
        if (i < 0) return null
        val current = entries[i]
        if (current is ListEntry.SeriesEntry) {
            SeriesRules.nextEpisode(current.episodes, currentId)?.let { return ListPick(it, 0.0) }
        }
        return start(entries.drop(i + 1), progress)
    }

    private fun entryStart(entry: ListEntry, progress: List<EpisodeProgress>): ListPick? = when (entry) {
        is ListEntry.MovieEntry -> {
            val saved = progress.firstOrNull { it.movieId == entry.movie.id }?.position
            ListPick(entry.movie, ProgressRules.resumePosition(saved, entry.movie.durationSeconds))
        }
        is ListEntry.SeriesEntry -> SeriesRules.nextUp(entry.episodes, progress)?.let { ListPick(it.episode, it.startAt) }
    }
}
