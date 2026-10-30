package com.mavros.archiver.core.android.player

import android.content.Context
import androidx.media3.common.C
import androidx.media3.common.TrackSelectionParameters
import androidx.media3.common.Tracks
import com.mavros.archiver.core.model.TrackOption
import com.mavros.archiver.core.model.TrackRules

/**
 * Idiomas de audio y subtítulos de la película que se está viendo (MOB-20, TV-09).
 * [selectedSubtitles] null = apagados.
 */
data class TrackChoices(
    val audio: List<TrackOption> = emptyList(),
    val selectedAudio: String? = null,
    val subtitles: List<TrackOption> = emptyList(),
    val selectedSubtitles: String? = null,
) {
    /** Hay algo que elegir: más de un idioma de audio o algún subtítulo */
    val hasChoices get() = audio.size > 1 || subtitles.isNotEmpty()

    companion object {
        fun of(tracks: Tracks): TrackChoices {
            fun options(type: Int) = TrackRules.options(
                tracks.groups.filter { it.type == type }.flatMap { g -> (0 until g.length).map { g.getTrackFormat(it).language to g.getTrackFormat(it).label } },
            )
            fun selected(type: Int) = tracks.groups
                .filter { it.type == type && it.isSelected }
                .firstNotNullOfOrNull { g -> (0 until g.length).firstOrNull { g.isTrackSelected(it) }?.let { g.getTrackFormat(it).language } }
            return TrackChoices(options(C.TRACK_TYPE_AUDIO), selected(C.TRACK_TYPE_AUDIO), options(C.TRACK_TYPE_TEXT), selected(C.TRACK_TYPE_TEXT))
        }
    }
}

/** Audio en [language] (si la película lo tiene; si no, el que traiga por defecto) */
fun TrackSelectionParameters.withAudio(language: String?): TrackSelectionParameters =
    buildUpon().setPreferredAudioLanguage(language).build()

/** Subtítulos en [language]; null o [TrackRules.OFF] = apagados (así arrancan, MOB-20) */
fun TrackSelectionParameters.withSubtitles(language: String?): TrackSelectionParameters =
    if (language == null || language == TrackRules.OFF) {
        buildUpon().setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true).build()
    } else {
        buildUpon().setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false).setPreferredTextLanguage(language).build()
    }

/** Lo elegido se recuerda en el dispositivo y se aplica a las siguientes películas (MOB-20) */
class TrackPreferences(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("mavros.tracks", Context.MODE_PRIVATE)

    var audioLanguage: String?
        get() = prefs.getString(AUDIO, null)
        set(value) = prefs.edit().putString(AUDIO, value).apply()

    /** Idioma o [TrackRules.OFF] */
    var subtitlesLanguage: String?
        get() = prefs.getString(SUBTITLES, null)
        set(value) = prefs.edit().putString(SUBTITLES, value).apply()

    fun applyTo(params: TrackSelectionParameters): TrackSelectionParameters =
        params.withAudio(audioLanguage).withSubtitles(subtitlesLanguage)

    private companion object {
        const val AUDIO = "audio"
        const val SUBTITLES = "subtitles"
    }
}
