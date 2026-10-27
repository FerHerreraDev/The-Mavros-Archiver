package com.mavros.archiver.core.model

import java.time.OffsetDateTime

/** Progreso de un episodio, como sale de `watch_progress` */
data class EpisodeProgress(val movieId: String, val position: Double, val updatedAt: String)

/** Start = nunca vista ("Reproducir"), Continue = a medias, Play = siguiente o recién empezado, Rewatch = ya se terminó toda */
enum class NextUpAction { Start, Continue, Play, Rewatch }

data class NextUp(val episode: Movie, val action: NextUpAction, val startAt: Double) {
    /** Texto del botón de la serie (SER-10) */
    val label: String get() {
        val tag = episode.episodeTag.orEmpty()
        return when (action) {
            NextUpAction.Continue -> "Continuar $tag desde ${formatTimestamp(startAt)}"
            NextUpAction.Rewatch -> "Volver a ver $tag"
            else -> "Reproducir $tag"
        }
    }
}

data class SeriesContinue(val episode: Movie, val positionSeconds: Double, val updatedAt: String)

/** "T1:E2" */
fun episodeLabel(season: Int, episode: Int) = "T$season:E$episode"

/** "Temporada 1", o "Especiales" para la 0 */
fun seasonName(season: Int) = if (season == 0) "Especiales" else "Temporada $season"

/**
 * Reglas de series (SER-10, SER-11, SER-13). Deben dar lo mismo que lib/series.ts de la web:
 * las dos implementaciones se prueban con tests/fixtures/series-cases.json.
 */
object SeriesRules {
    /** Temporada ascendente con la 0 (especiales) al final; luego episodio ascendente */
    fun sortEpisodes(episodes: List<Movie>): List<Movie> =
        episodes.sortedWith(compareBy({ seasonKey(it.seasonNumber ?: 0) }, { it.episodeNumber ?: 0 }))

    /** El que sigue en orden (cruza temporadas); null si es el último o no está */
    fun nextEpisode(episodes: List<Movie>, currentId: String): Movie? {
        val ordered = sortEpisodes(episodes)
        val i = ordered.indexOfFirst { it.id == currentId }
        return if (i >= 0 && i < ordered.size - 1) ordered[i + 1] else null
    }

    /** Qué sigue en la serie: el botón principal de su página. null si no tiene episodios. */
    fun nextUp(episodes: List<Movie>, progress: List<EpisodeProgress>): NextUp? {
        val ordered = sortEpisodes(episodes)
        if (ordered.isEmpty()) return null
        val (episode, entry) = latestWatched(ordered, progress) ?: return NextUp(ordered.first(), NextUpAction.Start, 0.0)

        if (!isFinished(entry.position, episode.durationSeconds)) {
            val startAt = ProgressRules.resumePosition(entry.position, episode.durationSeconds)
            return NextUp(episode, if (startAt > 0) NextUpAction.Continue else NextUpAction.Play, startAt)
        }
        val next = nextEpisode(ordered, episode.id)
        return if (next != null) NextUp(next, NextUpAction.Play, 0.0) else NextUp(ordered.first(), NextUpAction.Rewatch, 0.0)
    }

    /** Entrada de la serie en "Seguir viendo": a medias (5–95 %) o el siguiente de uno terminado */
    fun seriesContinue(episodes: List<Movie>, progress: List<EpisodeProgress>): SeriesContinue? {
        val (episode, entry) = latestWatched(episodes, progress) ?: return null
        if (!isFinished(entry.position, episode.durationSeconds)) {
            return if (ProgressRules.isInProgress(entry.position, episode.durationSeconds)) {
                SeriesContinue(episode, entry.position, entry.updatedAt)
            } else null
        }
        val next = nextEpisode(episodes, episode.id) ?: return null
        return SeriesContinue(next, 0.0, entry.updatedAt)
    }

    /** Para ordenar fechas de Supabase ("…+00:00") y de los casos ("…Z") */
    fun instantOf(timestamp: String) = OffsetDateTime.parse(timestamp).toInstant()

    private fun seasonKey(season: Int) = if (season == 0) Int.MAX_VALUE else season

    private fun isFinished(position: Double, duration: Int) = duration > 0 && position / duration >= ProgressRules.FINISHED_RATIO

    private fun latestWatched(episodes: List<Movie>, progress: List<EpisodeProgress>): Pair<Movie, EpisodeProgress>? {
        val byId = episodes.associateBy { it.id }
        return progress
            .mapNotNull { entry -> byId[entry.movieId]?.let { it to entry } }
            .maxByOrNull { instantOf(it.second.updatedAt) }
    }
}
