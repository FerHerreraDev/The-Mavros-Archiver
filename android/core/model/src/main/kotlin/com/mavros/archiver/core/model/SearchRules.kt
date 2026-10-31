package com.mavros.archiver.core.model

import java.text.Normalizer

/** Un resultado de búsqueda: película o serie (SRCH-01) */
sealed interface SearchHit {
    val id: String
    data class MovieHit(val movie: Movie) : SearchHit { override val id get() = movie.id }
    data class SeriesHit(val series: CatalogSeries) : SearchHit { override val id get() = series.series.id }
}

/** Misma regla que lib/search.ts de la web y SearchRules.swift del iPad (casos en tests/fixtures/search-cases.json) */
object SearchRules {
    private val marks = Regex("\\p{M}+")
    private val separators = Regex("[^\\p{L}\\p{N}]+")

    /** minúsculas, sin acentos y con signos como espacios: "Spider-Man: Él" → "spider man el" */
    fun normalize(text: String): String =
        Normalizer.normalize(text, Normalizer.Form.NFD).replace(marks, "").lowercase().replace(separators, " ").trim()

    /** Lo que coincide con [query], mejor primero; empates en el orden recibido */
    fun <T> search(items: List<T>, query: String, names: (T) -> List<String?>): List<T> {
        val q = normalize(query)
        if (q.isEmpty()) return emptyList()
        val words = q.split(' ')
        return items.mapIndexedNotNull { index, item ->
            val normalized = names(item).mapNotNull { it?.let(::normalize)?.takeIf(String::isNotEmpty) }
            val all = normalized.joinToString(" ")
            if (!words.all { it in all }) return@mapIndexedNotNull null
            val rank = when {
                normalized.any { it.startsWith(q) } -> 0
                normalized.any { name -> name.split(' ').any { it.startsWith(words[0]) } } -> 1
                else -> 2
            }
            Triple(item, rank, index)
        }.sortedWith(compareBy({ it.second }, { it.third })).map { it.first }
    }

    /** Películas (sin episodios sueltos) y series publicadas del catálogo (SRCH-01) */
    fun searchCatalog(catalog: Catalog, query: String): List<SearchHit> = search(
        catalog.recent.filter { !it.isEpisode }.map { SearchHit.MovieHit(it) } + catalog.series.map { SearchHit.SeriesHit(it) },
        query,
    ) { hit ->
        when (hit) {
            is SearchHit.MovieHit -> listOf(hit.movie.title, hit.movie.originalTitle)
            is SearchHit.SeriesHit -> listOf(hit.series.series.title, hit.series.series.originalTitle)
        }
    }
}
