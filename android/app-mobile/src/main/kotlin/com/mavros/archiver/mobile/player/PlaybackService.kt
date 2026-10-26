package com.mavros.archiver.mobile.player

import android.app.PendingIntent
import android.content.Intent
import android.os.Bundle
import androidx.annotation.OptIn
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import com.google.common.util.concurrent.ListenableFuture
import com.mavros.archiver.core.android.player.PlaybackSession
import com.mavros.archiver.mobile.MavrosApplication
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.guava.future

/** Datos de la película que viajan en el MediaItem desde PlayerActivity */
object PlaybackExtras {
    const val EXPIRES_AT_MS = "mavros.expiresAtMs"
    const val DURATION_SECONDS = "mavros.durationSeconds"
}

/**
 * Dueño del reproductor (MOB-13..MOB-18). Vive en un MediaSessionService para que:
 * - la reproducción siga en Picture-in-Picture y con la pantalla bloqueada,
 * - el sistema muestre los controles en la notificación de medios y en la pantalla de bloqueo.
 * Token y progreso los lleva [PlaybackSession] (core:android), el mismo motor que usa la tele.
 */
@OptIn(UnstableApi::class)
class PlaybackService : MediaSessionService() {
    private val container by lazy { (application as MavrosApplication).container }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val playback by lazy { PlaybackSession(scope, container.appScope, container.playback, container.progress) }

    private lateinit var player: ExoPlayer
    private var session: MediaSession? = null

    override fun onCreate() {
        super.onCreate()
        player = playback.buildPlayer(this)

        val open = PendingIntent.getActivity(
            this, 0, Intent(this, PlayerActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        session = MediaSession.Builder(this, player)
            .setSessionActivity(open)
            .setCallback(Callback())
            .build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session

    /** Cerrar la app desde recientes: guarda y termina */
    override fun onTaskRemoved(rootIntent: Intent?) {
        playback.saveExit()
        player.stop()
        stopSelf()
    }

    override fun onDestroy() {
        playback.release()
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
         * requestMetadata y aquí se arma el MediaItem real, y empieza el seguimiento de esa película.
         */
        override fun onAddMediaItems(
            mediaSession: MediaSession,
            controller: MediaSession.ControllerInfo,
            mediaItems: MutableList<MediaItem>,
        ): ListenableFuture<MutableList<MediaItem>> = scope.future {
            mediaItems.map { item ->
                val extras = item.requestMetadata.extras ?: Bundle()
                val url = item.requestMetadata.mediaUri?.toString().orEmpty()
                playback.start(item.mediaId, url, extras.getLong(PlaybackExtras.EXPIRES_AT_MS), extras.getInt(PlaybackExtras.DURATION_SECONDS))
                item.buildUpon()
                    .setUri(item.requestMetadata.mediaUri)
                    .setMimeType(MimeTypes.APPLICATION_M3U8)
                    .build()
            }.toMutableList()
        }
    }
}
