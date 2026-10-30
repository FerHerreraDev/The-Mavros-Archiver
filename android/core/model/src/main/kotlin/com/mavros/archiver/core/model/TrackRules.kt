package com.mavros.archiver.core.model

/** Un idioma de audio o de subtítulos que ofrece el reproductor (MOB-20, TV-09) */
data class TrackOption(val language: String, val label: String)

/** Idiomas de audio y subtítulos elegidos y recordados (MOB-20). Mismas reglas que la web (WATCH-05). */
object TrackRules {
    /** Subtítulos apagados a propósito */
    const val OFF = "off"

    private fun primary(lang: String?) = lang.orEmpty().lowercase().substringBefore('-')

    fun sameLanguage(a: String?, b: String?) = primary(a).isNotEmpty() && primary(a) == primary(b)

    /**
     * Índice de la pista con el idioma guardado ("es" también acepta "es-419"); -1 si no hay
     * preferencia, está apagada o la película no tiene ese idioma.
     */
    fun pick(languages: List<String?>, saved: String?): Int {
        if (saved == null || saved == OFF) return -1
        return languages.indexOfFirst { sameLanguage(it, saved) }
    }

    /** Un idioma por opción, en el orden de las pistas, con su nombre (NAME del master) o el código */
    fun options(tracks: List<Pair<String?, String?>>): List<TrackOption> =
        tracks
            .filter { (lang, _) -> primary(lang).isNotEmpty() && primary(lang) != "und" }
            .distinctBy { (lang, _) -> primary(lang) }
            .map { (lang, label) -> TrackOption(lang!!, label?.takeIf { it.isNotBlank() } ?: lang) }
}
