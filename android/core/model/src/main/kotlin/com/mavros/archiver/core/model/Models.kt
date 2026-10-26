package com.mavros.archiver.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Película tal como la devuelve Supabase (columnas de `movies`) */
@Serializable
data class Movie(
    val id: String,
    val slug: String,
    val title: String,
    @SerialName("original_title") val originalTitle: String? = null,
    val synopsis: String? = null,
    @SerialName("release_year") val releaseYear: Int? = null,
    @SerialName("duration_seconds") val durationSeconds: Int,
    val genres: List<String> = emptyList(),
    @SerialName("poster_url") val posterUrl: String? = null,
    @SerialName("hls_path") val hlsPath: String? = null,
    val status: String = "published",
    @SerialName("published_at") val publishedAt: String? = null,
)

data class ContinueItem(val movie: Movie, val positionSeconds: Double)

data class Catalog(
    val genres: List<String>,
    val recent: List<Movie>,
    val continueWatching: List<ContinueItem>,
)

data class MovieDetail(val movie: Movie, val positionSeconds: Double?)

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
