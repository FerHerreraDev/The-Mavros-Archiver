package com.mavros.archiver.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Lo que necesita un póster: película o serie */
interface HasPoster {
    val id: String
    val title: String
    val posterSrc: String?
    val posterThumbhash: String?
}

/** Película o episodio tal como lo devuelve Supabase (columnas de `movies`) */
@Serializable
data class Movie(
    override val id: String,
    val slug: String,
    override val title: String,
    @SerialName("original_title") val originalTitle: String? = null,
    val synopsis: String? = null,
    @SerialName("release_year") val releaseYear: Int? = null,
    @SerialName("duration_seconds") val durationSeconds: Int,
    val genres: List<String> = emptyList(),
    @SerialName("poster_url") val posterUrl: String? = null,
    /** Copia optimizada en el bucket `posters` (LOAD-07); si no hay, se usa [posterUrl] */
    @SerialName("poster_image_url") val posterImageUrl: String? = null,
    /** Vista previa borrosa del póster en base64 (LOAD-02) */
    @SerialName("poster_thumbhash") override val posterThumbhash: String? = null,
    @SerialName("hls_path") val hlsPath: String? = null,
    val status: String = "published",
    @SerialName("published_at") val publishedAt: String? = null,
    /** Episodio (SER-03): serie, temporada y número juntos o null */
    @SerialName("series_id") val seriesId: String? = null,
    @SerialName("season_number") val seasonNumber: Int? = null,
    @SerialName("episode_number") val episodeNumber: Int? = null,
) : HasPoster {
    /** La imagen que se carga: la copia propia si existe */
    override val posterSrc: String? get() = posterImageUrl ?: posterUrl
    val isEpisode: Boolean get() = seriesId != null && seasonNumber != null && episodeNumber != null
    /** "T1:E2" de un episodio; null en películas */
    val episodeTag: String? get() = if (isEpisode) episodeLabel(seasonNumber!!, episodeNumber!!) else null
}

/** Serie tal como la devuelve Supabase (columnas de `series`) */
@Serializable
data class Series(
    override val id: String,
    val slug: String,
    override val title: String,
    @SerialName("original_title") val originalTitle: String? = null,
    val synopsis: String? = null,
    @SerialName("release_year") val releaseYear: Int? = null,
    val genres: List<String> = emptyList(),
    @SerialName("poster_url") val posterUrl: String? = null,
    @SerialName("poster_image_url") val posterImageUrl: String? = null,
    @SerialName("poster_thumbhash") override val posterThumbhash: String? = null,
    val status: String = "published",
    @SerialName("published_at") val publishedAt: String? = null,
) : HasPoster {
    override val posterSrc: String? get() = posterImageUrl ?: posterUrl
}

/** Serie en el catálogo con cuántas temporadas y episodios visibles tiene (SER-08) */
data class CatalogSeries(val series: Series, val seasons: Int, val episodes: Int) {
    /** "2 temporadas" o, si es una sola, "8 episodios" */
    val countLabel: String get() = when {
        seasons > 1 -> "$seasons temporadas"
        episodes == 1 -> "1 episodio"
        else -> "$episodes episodios"
    }
}

/** En "Seguir viendo": película, o episodio con su serie (SER-11) */
data class ContinueItem(val movie: Movie, val positionSeconds: Double, val series: Series? = null)

data class Catalog(
    val genres: List<String>,
    val recent: List<Movie>,
    val continueWatching: List<ContinueItem>,
    val series: List<CatalogSeries> = emptyList(),
)

/** [series] y [next] solo si es un episodio: su serie y el siguiente publicado (SER-12) */
data class MovieDetail(val movie: Movie, val positionSeconds: Double?, val series: Series? = null)

/** Página de la serie (SER-09, SER-10): episodios en orden, progreso por episodio y qué sigue */
data class SeriesDetail(
    val series: Series,
    val episodes: List<Movie>,
    val progress: Map<String, Double>,
    val next: NextUp?,
) {
    val seasons: List<Int> get() = episodes.mapNotNull { it.seasonNumber }.distinct()
}

/** "1 h 39 min", "25 min", "22 s" (igual que formatDuration de la web) */
fun formatDuration(seconds: Int): String {
    if (seconds < 60) return "$seconds s"
    val h = seconds / 3600
    val m = Math.round((seconds % 3600) / 60.0).toInt()
    return if (h > 0) "$h h $m min" else "$m min"
}

/** Para tarjetas angostas: "1h 39m", "25m", "22s" */
fun formatDurationShort(seconds: Int): String {
    if (seconds < 60) return "${seconds}s"
    val h = seconds / 3600
    val m = Math.round((seconds % 3600) / 60.0).toInt()
    return if (h > 0) "${h}h ${m}m" else "${m}m"
}

/** 754.2 -> "12:34", 3725 -> "1:02:05" */
fun formatTimestamp(seconds: Double): String {
    val total = seconds.toLong()
    val h = total / 3600
    val m = (total % 3600) / 60
    val s = total % 60
    return if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%d:%02d".format(m, s)
}
