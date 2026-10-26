package com.mavros.archiver.tv.player

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.KeyEvent
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.annotation.OptIn
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import com.mavros.archiver.core.android.player.PlaybackSession
import com.mavros.archiver.core.android.player.PlayerUiState
import com.mavros.archiver.core.android.player.PlayerViewModel
import com.mavros.archiver.core.design.MavrosLoader
import com.mavros.archiver.core.model.Movie
import com.mavros.archiver.tv.MavrosTvTheme
import com.mavros.archiver.tv.TvApplication
import com.mavros.archiver.tv.catalog.Message
import com.mavros.archiver.tv.catalog.errorText

/** Qué hace cada botón del control en el reproductor (TV-06) */
enum class TvPlayerAction { TogglePlay, SeekBack, SeekForward, Exit }

fun tvPlayerAction(keyCode: Int): TvPlayerAction? = when (keyCode) {
    KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_NUMPAD_ENTER,
    KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, KeyEvent.KEYCODE_MEDIA_PLAY, KeyEvent.KEYCODE_MEDIA_PAUSE -> TvPlayerAction.TogglePlay
    KeyEvent.KEYCODE_DPAD_LEFT, KeyEvent.KEYCODE_MEDIA_REWIND -> TvPlayerAction.SeekBack
    KeyEvent.KEYCODE_DPAD_RIGHT, KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> TvPlayerAction.SeekForward
    KeyEvent.KEYCODE_BACK, KeyEvent.KEYCODE_MEDIA_STOP -> TvPlayerAction.Exit
    else -> null
}

/**
 * Reproductor de la tele (TV-06). Usa el mismo motor que el teléfono ([PlaybackSession]): token
 * siempre al día y progreso con las mismas reglas. Sin servicio ni PiP: en la tele no hacen falta.
 */
@OptIn(UnstableApi::class)
class TvPlayerActivity : ComponentActivity() {
    companion object {
        private const val MOVIE_ID = "movieId"
        private const val TITLE = "title"
        private const val DURATION = "duration"
        private const val START_AT = "startAt"

        fun intent(context: Context, movie: Movie, startAtSeconds: Double): Intent =
            Intent(context, TvPlayerActivity::class.java)
                .putExtra(MOVIE_ID, movie.id)
                .putExtra(TITLE, movie.title)
                .putExtra(DURATION, movie.durationSeconds)
                .putExtra(START_AT, startAtSeconds)
    }

    private lateinit var session: PlaybackSession
    private lateinit var player: ExoPlayer
    private var playerView: PlayerView? = null
    private var started = false
    private var buffering by mutableStateOf(true)
    private var failed by mutableStateOf(false)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val container = (application as TvApplication).container
        val movieId = intent.getStringExtra(MOVIE_ID).orEmpty()
        val duration = intent.getIntExtra(DURATION, 0)
        val startAt = intent.getDoubleExtra(START_AT, 0.0)

        session = PlaybackSession(lifecycleScope, container.appScope, container.playback, container.progress)
        player = session.buildPlayer(this)
        player.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                buffering = state == Player.STATE_BUFFERING
                if (state == Player.STATE_READY) failed = false
            }
            override fun onPlayerError(error: PlaybackException) { failed = true }
        })

        setContent {
            MavrosTvTheme {
                val vm: PlayerViewModel = viewModel(factory = viewModelFactory { initializer { PlayerViewModel(container.playback, movieId) } })
                val state by vm.state.collectAsStateWithLifecycle()
                LaunchedEffect(state) {
                    val ready = state as? PlayerUiState.Ready ?: return@LaunchedEffect
                    if (started) return@LaunchedEffect
                    started = true
                    session.start(movieId, ready.source.url, ready.source.expiresAtMs, duration)
                    player.setMediaItem(MediaItem.Builder().setUri(ready.source.url).setMimeType(MimeTypes.APPLICATION_M3U8).build(), (startAt * 1000).toLong())
                    player.prepare()
                    player.play()
                }
                Box(Modifier.fillMaxSize().background(Color.Black)) {
                    when (val s = state) {
                        PlayerUiState.Loading -> MavrosLoader(Modifier.align(Alignment.Center).testTag("tv-loading"), size = 72.dp)
                        PlayerUiState.NotAvailable -> Message("Esta película no está disponible.", null)
                        is PlayerUiState.Error -> Message(errorText(s.error), vm::retry)
                        is PlayerUiState.Ready -> {
                            AndroidView(
                                factory = { ctx ->
                                    PlayerView(ctx).apply {
                                        this.player = this@TvPlayerActivity.player
                                        keepScreenOn = true
                                        setShowBuffering(PlayerView.SHOW_BUFFERING_NEVER)
                                        setShowNextButton(false)
                                        setShowPreviousButton(false)
                                        setShowSubtitleButton(false)
                                        playerView = this
                                    }
                                },
                                modifier = Modifier.fillMaxSize(),
                            )
                            if (failed) Message("No se pudo reproducir el video. Revisa la conexión.") { failed = false; player.prepare(); player.play() }
                            else if (buffering) MavrosLoader(Modifier.align(Alignment.Center), size = 72.dp)
                        }
                    }
                }
            }
        }
    }

    /** Control remoto (TV-06): OK pausa/reproduce, ←/→ ±10 s, Atrás sale guardando */
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val action = tvPlayerAction(event.keyCode) ?: return super.dispatchKeyEvent(event)
        if (failed && action != TvPlayerAction.Exit) return super.dispatchKeyEvent(event) // "Reintentar" recibe el OK
        if (event.action != KeyEvent.ACTION_DOWN) return true
        when (action) {
            TvPlayerAction.TogglePlay -> if (player.isPlaying) player.pause() else player.play()
            TvPlayerAction.SeekBack -> player.seekBack()
            TvPlayerAction.SeekForward -> player.seekForward()
            TvPlayerAction.Exit -> finish()
        }
        playerView?.showController()
        return true
    }

    override fun onStop() {
        super.onStop()
        player.pause() // pausar guarda el progreso
    }

    override fun onDestroy() {
        session.release() // guarda la posición de salida
        player.release()
        super.onDestroy()
    }
}
