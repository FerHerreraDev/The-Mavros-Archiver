package com.mavros.archiver.core.android.player

import android.content.Context
import android.net.Uri
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.HttpDataSource
import androidx.media3.datasource.ResolvingDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.upstream.DefaultLoadErrorHandlingPolicy
import androidx.media3.exoplayer.upstream.LoadErrorHandlingPolicy
import com.mavros.archiver.core.data.DataResult
import com.mavros.archiver.core.data.PlaybackRepository
import com.mavros.archiver.core.data.ProgressRepository
import com.mavros.archiver.core.model.PlaybackRules
import com.mavros.archiver.core.model.ProgressTracker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Motor de reproducción compartido por el teléfono (PlaybackService) y la tele (TV-06):
 * - Cambia el token de cada petición (playlists y segmentos) por el más reciente.
 * - Renueva la URL 5 min antes de caducar y ante cualquier 403 del Worker (MOB-16).
 * - Guarda el progreso con las reglas de [ProgressTracker] (MOB-15).
 */
@OptIn(UnstableApi::class)
class PlaybackSession(
    private val scope: CoroutineScope,
    private val appScope: CoroutineScope,
    private val playback: PlaybackRepository,
    private val progress: ProgressRepository,
) {
    // Se leen desde los hilos de carga de ExoPlayer
    @Volatile var latestUrl: String? = null
        private set
    private var movieId: String? = null
    private var expiresAtMs = 0L
    private var tracker: ProgressTracker? = null
    private var refreshJob: Job? = null
    private var tickJob: Job? = null
    private var player: Player? = null

    /** ExoPlayer con HLS, token siempre al día y reintento ante 403 */
    fun buildPlayer(context: Context): ExoPlayer {
        val upstream = DefaultHttpDataSource.Factory().setAllowCrossProtocolRedirects(false)
        val dataSource = ResolvingDataSource.Factory(upstream) { spec ->
            val latest = latestUrl ?: return@Factory spec
            spec.withUri(Uri.parse(PlaybackRules.swapToken(spec.uri.toString(), latest)))
        }
        val mediaSources = DefaultMediaSourceFactory(context)
            .setDataSourceFactory(dataSource)
            .setLoadErrorHandlingPolicy(TokenAwareErrorPolicy { refreshNow() })
        val exo = ExoPlayer.Builder(context)
            .setMediaSourceFactory(mediaSources)
            .setAudioAttributes(AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build(), true)
            .setHandleAudioBecomingNoisy(true)
            .setSeekBackIncrementMs(10_000)
            .setSeekForwardIncrementMs(10_000)
            .build()
        // Idiomas recordados en el dispositivo; los subtítulos arrancan apagados (MOB-20)
        exo.trackSelectionParameters = TrackPreferences(context).applyTo(exo.trackSelectionParameters)
        attach(exo)
        return exo
    }

    private fun attach(p: Player) {
        player = p
        p.addListener(object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                val now = System.currentTimeMillis()
                if (isPlaying) tracker?.onPlaying(now) else save(tracker?.onPause(positionSeconds(), now))
            }
        })
        tickJob?.cancel()
        tickJob = scope.launch {
            while (isActive) {
                delay(1_000)
                save(tracker?.onTick(positionSeconds(), p.isPlaying, System.currentTimeMillis()))
            }
        }
    }

    /** Nueva película: guarda la anterior y empieza a llevar token y progreso de esta */
    fun start(movieId: String, url: String, expiresAtMs: Long, durationSeconds: Int) {
        saveExit()
        this.movieId = movieId
        latestUrl = url
        this.expiresAtMs = expiresAtMs
        tracker = ProgressTracker(durationSeconds)
        scheduleRefresh()
    }

    /** Salir (atrás, cerrar, destruir): guarda la posición si ya había arrancado */
    fun saveExit() {
        save(tracker?.onExit(positionSeconds(), System.currentTimeMillis()))
    }

    fun release() {
        saveExit()
        refreshJob?.cancel()
        tickJob?.cancel()
        player = null
    }

    private fun positionSeconds() = (player?.currentPosition ?: 0L) / 1000.0

    private fun save(position: Double?) {
        val id = movieId ?: return
        position ?: return
        // En el alcance de la app: el guardado termina aunque la pantalla o el servicio se destruyan
        appScope.launch { progress.save(id, position) }
    }

    private fun scheduleRefresh() {
        refreshJob?.cancel()
        refreshJob = scope.launch {
            delay(PlaybackRules.refreshDelayMs(expiresAtMs, System.currentTimeMillis()))
            refresh()
        }
    }

    /** Llamado desde el hilo de carga ante un 403 */
    private fun refreshNow() {
        scope.launch {
            refreshJob?.cancel()
            refreshJob = launch { refresh() }
        }
    }

    private suspend fun refresh() {
        val id = movieId ?: return
        when (val result = playback.source(id)) {
            is DataResult.Success -> result.value?.let {
                latestUrl = it.url
                expiresAtMs = it.expiresAtMs
                scheduleRefresh()
            }
            // Sin red o sesión inválida: ExoPlayer reintenta y, si no se puede, muestra el error
            is DataResult.Failure -> Unit
        }
    }
}

/**
 * 403 del Worker = token caducado: se pide una URL nueva y se reintenta la misma petición
 * (ya con el token nuevo, vía ResolvingDataSource). El resto de errores, como siempre.
 */
@OptIn(UnstableApi::class)
class TokenAwareErrorPolicy(private val onForbidden: () -> Unit) : DefaultLoadErrorHandlingPolicy() {
    override fun getRetryDelayMsFor(loadErrorInfo: LoadErrorHandlingPolicy.LoadErrorInfo): Long {
        val error = loadErrorInfo.exception
        if (error is HttpDataSource.InvalidResponseCodeException && error.responseCode == 403 && loadErrorInfo.errorCount <= 5) {
            onForbidden()
            return 1_500
        }
        return super.getRetryDelayMsFor(loadErrorInfo)
    }

    // Por defecto un 403 descarta esa calidad un minuto; aquí es el token, no la calidad
    override fun getFallbackSelectionFor(
        fallbackOptions: LoadErrorHandlingPolicy.FallbackOptions,
        loadErrorInfo: LoadErrorHandlingPolicy.LoadErrorInfo,
    ): LoadErrorHandlingPolicy.FallbackSelection? {
        val error = loadErrorInfo.exception
        if (error is HttpDataSource.InvalidResponseCodeException && error.responseCode == 403) return null
        return super.getFallbackSelectionFor(fallbackOptions, loadErrorInfo)
    }

    override fun getMinimumLoadableRetryCount(dataType: Int): Int = maxOf(super.getMinimumLoadableRetryCount(dataType), 6)
}
