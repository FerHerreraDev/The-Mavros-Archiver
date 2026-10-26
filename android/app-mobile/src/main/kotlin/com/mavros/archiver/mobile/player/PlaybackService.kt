package com.mavros.archiver.mobile.player

import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.HttpDataSource
import androidx.media3.datasource.ResolvingDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.upstream.DefaultLoadErrorHandlingPolicy
import androidx.media3.exoplayer.upstream.LoadErrorHandlingPolicy
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import com.google.common.util.concurrent.ListenableFuture
import com.mavros.archiver.core.data.DataResult
import com.mavros.archiver.core.model.PlaybackRules
import com.mavros.archiver.core.model.ProgressTracker
import com.mavros.archiver.mobile.MavrosApplication
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.guava.future
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/** Datos de la película que viajan en el MediaItem desde PlayerActivity */
object PlaybackExtras {
    const val EXPIRES_AT_MS = "mavros.expiresAtMs"
    const val DURATION_SECONDS = "mavros.durationSeconds"
}

/**
 * Dueño del reproductor (MOB-13..MOB-18). Vive en un MediaSessionService para que:
 * - la reproducción siga en Picture-in-Picture y con la pantalla bloqueada,
 * - el sistema muestre los controles en la notificación de medios y en la pantalla de bloqueo.
 *
 * Además:
 * - Renueva el token del Worker 5 min antes de caducar y ante un 403, y cambia el token en cada
 *   petición (playlists y segmentos) por el más reciente: el video sigue sin cortarse (MOB-16).
 * - Guarda el progreso con las reglas de [ProgressTracker] (MOB-15).
 */
@OptIn(UnstableApi::class)
class PlaybackService : MediaSessionService() {
    private val container by lazy { (application as MavrosApplication).container }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    private lateinit var player: ExoPlayer
    private var session: MediaSession? = null

    // Se leen desde los hilos de carga de ExoPlayer
    @Volatile private var latestUrl: String? = null
    private var movieId: String? = null
    private var expiresAtMs = 0L
    private var tracker: ProgressTracker? = null
    private var refreshJob: Job? = null
    private var tickJob: Job? = null

    override fun onCreate() {
        super.onCreate()

        // Cada petición (playlist o segmento) sale con el token más reciente
        val upstream = DefaultHttpDataSource.Factory().setAllowCrossProtocolRedirects(false)
        val dataSource = ResolvingDataSource.Factory(upstream) { spec ->
            val latest = latestUrl ?: return@Factory spec
            spec.withUri(Uri.parse(PlaybackRules.swapToken(spec.uri.toString(), latest)))
        }
        val mediaSources = DefaultMediaSourceFactory(this)
            .setDataSourceFactory(dataSource)
            .setLoadErrorHandlingPolicy(TokenAwareErrorPolicy { refreshNow() })

        player = ExoPlayer.Builder(this)
            .setMediaSourceFactory(mediaSources)
            .setAudioAttributes(AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MOVIE).build(), true)
            .setHandleAudioBecomingNoisy(true) // audífonos desconectados: pausa
            .setSeekBackIncrementMs(10_000)
            .setSeekForwardIncrementMs(10_000)
            .build()
        player.addListener(object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                val now = System.currentTimeMillis()
                if (isPlaying) tracker?.onPlaying(now) else save(tracker?.onPause(positionSeconds(), now))
            }
        })

        val open = PendingIntent.getActivity(
            this, 0, Intent(this, PlayerActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        session = MediaSession.Builder(this, player)
            .setSessionActivity(open)
            .setCallback(Callback())
            .build()

        tickJob = scope.launch {
            while (isActive) {
                delay(1_000)
                save(tracker?.onTick(positionSeconds(), player.isPlaying, System.currentTimeMillis()))
            }
        }
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session

    /** Cerrar la app desde recientes: guarda y termina */
    override fun onTaskRemoved(rootIntent: Intent?) {
        saveExit()
        player.stop()
        stopSelf()
    }

    override fun onDestroy() {
        saveExit()
        session?.release()
        session = null
        player.release()
        scope.cancel()
        super.onDestroy()
    }

    private inner class Callback : MediaSession.Callback {
        /** Solo esta app y controladores de confianza del sistema (notificación, bloqueo, Bluetooth) */
        override fun onConnect(session: MediaSession, controller: MediaSession.ControllerInfo): MediaSession.ConnectionResult =
            if (controller.packageName == packageName || controller.isTrusted) super.onConnect(session, controller)
            else MediaSession.ConnectionResult.reject()

        /**
         * MediaController no puede mandar la URL interna (localConfiguration): llega en
         * requestMetadata y aquí se arma el MediaItem real. También empieza un tracker nuevo.
         */
        override fun onAddMediaItems(
            mediaSession: MediaSession,
            controller: MediaSession.ControllerInfo,
            mediaItems: MutableList<MediaItem>,
        ): ListenableFuture<MutableList<MediaItem>> = scope.future {
            mediaItems.map { item ->
                val extras = item.requestMetadata.extras ?: Bundle()
                saveExit() // si había otra película, su progreso no se pierde
                movieId = item.mediaId
                latestUrl = item.requestMetadata.mediaUri?.toString()
                expiresAtMs = extras.getLong(PlaybackExtras.EXPIRES_AT_MS)
                tracker = ProgressTracker(extras.getInt(PlaybackExtras.DURATION_SECONDS))
                scheduleRefresh()
                item.buildUpon()
                    .setUri(item.requestMetadata.mediaUri)
                    .setMimeType(MimeTypes.APPLICATION_M3U8)
                    .build()
            }.toMutableList()
        }
    }

    // --- Token (MOB-16) ---------------------------------------------------

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
            if (refreshJob?.isActive == true && PlaybackRules.refreshDelayMs(expiresAtMs, System.currentTimeMillis()) == 0L) return@launch
            refreshJob?.cancel()
            refreshJob = launch { refresh() }
        }
    }

    private suspend fun refresh() {
        val id = movieId ?: return
        when (val result = container.playback.source(id)) {
            is DataResult.Success -> result.value?.let {
                latestUrl = it.url
                expiresAtMs = it.expiresAtMs
                scheduleRefresh()
            }
            // Sin red o sesión inválida: ExoPlayer reintenta y, si no se puede, muestra el error
            is DataResult.Failure -> Unit
        }
    }

    // --- Progreso (MOB-15) ------------------------------------------------

    private fun positionSeconds() = player.currentPosition / 1000.0

    private fun save(position: Double?) {
        val id = movieId ?: return
        position ?: return
        // En el alcance de la app: el guardado termina aunque el servicio se destruya
        container.appScope.launch { container.progress.save(id, position) }
    }

    private fun saveExit() {
        if (::player.isInitialized) save(tracker?.onExit(positionSeconds(), System.currentTimeMillis()))
    }
}

/**
 * 403 del Worker = token caducado: se pide una URL nueva y se reintenta la misma petición
 * (ya con el token nuevo, vía ResolvingDataSource). El resto de errores, como siempre.
 */
@OptIn(UnstableApi::class)
private class TokenAwareErrorPolicy(private val onForbidden: () -> Unit) : DefaultLoadErrorHandlingPolicy() {
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
