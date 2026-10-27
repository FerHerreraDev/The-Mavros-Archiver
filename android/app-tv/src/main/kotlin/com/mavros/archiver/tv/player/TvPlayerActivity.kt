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
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.media3.common.C
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.Tracks
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.mavros.archiver.core.android.player.qualityLabels
import com.mavros.archiver.core.design.MavrosColors
import com.mavros.archiver.core.model.formatTimestamp
import kotlinx.coroutines.delay
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
enum class TvPlayerAction { ShowControls, HideControls, TogglePlay, SeekBack, SeekForward, Exit, ToControls }

/**
 * Con los controles ocultos la actividad interpreta las flechas; con los controles visibles las
 * flechas y OK son de los botones (ToControls). Las teclas multimedia actúan siempre.
 */
fun tvPlayerAction(keyCode: Int, controlsVisible: Boolean): TvPlayerAction? = when (keyCode) {
    KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, KeyEvent.KEYCODE_MEDIA_PLAY, KeyEvent.KEYCODE_MEDIA_PAUSE -> TvPlayerAction.TogglePlay
    KeyEvent.KEYCODE_MEDIA_REWIND -> TvPlayerAction.SeekBack
    KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> TvPlayerAction.SeekForward
    KeyEvent.KEYCODE_MEDIA_STOP -> TvPlayerAction.Exit
    KeyEvent.KEYCODE_BACK -> if (controlsVisible) TvPlayerAction.HideControls else TvPlayerAction.Exit
    KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_NUMPAD_ENTER,
    KeyEvent.KEYCODE_DPAD_UP, KeyEvent.KEYCODE_DPAD_DOWN,
    -> if (controlsVisible) TvPlayerAction.ToControls else TvPlayerAction.ShowControls
    KeyEvent.KEYCODE_DPAD_LEFT -> if (controlsVisible) TvPlayerAction.ToControls else TvPlayerAction.SeekBack
    KeyEvent.KEYCODE_DPAD_RIGHT -> if (controlsVisible) TvPlayerAction.ToControls else TvPlayerAction.SeekForward
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
    /** Película/episodio que ya arrancó en el reproductor */
    private var startedId: String? = null
    private var ended by mutableStateOf(false)
    private var nextCancelled by mutableStateOf(false)
    /** "Siguiente episodio" en pantalla: las teclas son de sus botones (SER-16) */
    private var nextVisible = false

    /** Lo que se está viendo; cambia al pasar al siguiente episodio sin salir (SER-16) */
    private data class Current(val id: String, val title: String, val duration: Int, val startAt: Double)
    private var current by mutableStateOf(Current("", "", 0, 0.0))
    private var buffering by mutableStateOf(true)
    private var failed by mutableStateOf(false)
    private var controlsVisible by mutableStateOf(false)
    private var isPlaying by mutableStateOf(false)
    private var positionMs by mutableLongStateOf(0L)
    private var durationMs by mutableLongStateOf(0L)
    private var videoHeights by mutableStateOf(emptyList<Int>())
    private var selectedHeight by mutableStateOf<Int?>(null)
    /** Cambia con cada tecla: reinicia el temporizador que oculta los controles */
    private var interaction by mutableIntStateOf(0)
    /** Aviso breve "12:34 / 1:39:12" al adelantar/atrasar con los controles ocultos */
    private var seekHint by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val container = (application as TvApplication).container
        current = Current(
            intent.getStringExtra(MOVIE_ID).orEmpty(),
            intent.getStringExtra(TITLE).orEmpty(),
            intent.getIntExtra(DURATION, 0),
            intent.getDoubleExtra(START_AT, 0.0),
        )

        session = PlaybackSession(lifecycleScope, container.appScope, container.playback, container.progress)
        player = session.buildPlayer(this)
        player.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                buffering = state == Player.STATE_BUFFERING
                if (state == Player.STATE_READY) failed = false
                ended = state == Player.STATE_ENDED
            }
            override fun onPlayerError(error: PlaybackException) { failed = true }
            override fun onIsPlayingChanged(playing: Boolean) { isPlaying = playing }
            override fun onTracksChanged(tracks: Tracks) {
                videoHeights = tracks.groups.filter { it.type == C.TRACK_TYPE_VIDEO }
                    .flatMap { g -> (0 until g.length).map { g.getTrackFormat(it).height } }
            }
        })

        setContent {
            MavrosTvTheme {
                val movie = current
                // Una por película: al pasar al siguiente episodio se pide su propia URL (SER-16)
                val vm: PlayerViewModel = viewModel(key = movie.id, factory = viewModelFactory { initializer { PlayerViewModel(container.playback, movie.id, container.catalog) } })
                val state by vm.state.collectAsStateWithLifecycle()
                val next by vm.next.collectAsStateWithLifecycle()
                LaunchedEffect(state) {
                    val ready = state as? PlayerUiState.Ready ?: return@LaunchedEffect
                    if (startedId == movie.id) return@LaunchedEffect
                    startedId = movie.id
                    // start guarda la salida del episodio anterior y lleva token y progreso de este
                    session.start(movie.id, ready.source.url, ready.source.expiresAtMs, movie.duration)
                    player.setMediaItem(MediaItem.Builder().setUri(ready.source.url).setMimeType(MimeTypes.APPLICATION_M3U8).build(), (movie.startAt * 1000).toLong())
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
                                    // Solo la superficie del video: los controles son de Compose (TvPlayerControls)
                                    PlayerView(ctx).apply {
                                        this.player = this@TvPlayerActivity.player
                                        keepScreenOn = true
                                        useController = false
                                        isFocusable = false
                                        setShowBuffering(PlayerView.SHOW_BUFFERING_NEVER)
                                    }
                                },
                                modifier = Modifier.fillMaxSize(),
                            )
                            if (failed) {
                                Message("No se pudo reproducir el video. Revisa la conexión.") { failed = false; player.prepare(); player.play() }
                            } else {
                                if (buffering) MavrosLoader(Modifier.align(Alignment.Center), size = 72.dp)
                                // Posición al día mientras se ven los controles o el aviso de salto
                                LaunchedEffect(controlsVisible, seekHint) {
                                    while (controlsVisible || seekHint != null) {
                                        positionMs = player.currentPosition
                                        durationMs = player.duration.coerceAtLeast(0)
                                        delay(500)
                                    }
                                }
                                LaunchedEffect(seekHint) {
                                    if (seekHint != null) {
                                        delay(1_500)
                                        seekHint = null
                                    }
                                }
                                TvPlayerControls(
                                    visible = controlsVisible,
                                    title = movie.title,
                                    isPlaying = isPlaying,
                                    positionMs = positionMs,
                                    durationMs = durationMs,
                                    qualities = qualityLabels(videoHeights),
                                    selectedQuality = selectedHeight,
                                    onTogglePlay = ::togglePlay,
                                    onSeekBack = { player.seekBack() },
                                    onSeekForward = { player.seekForward() },
                                    onSelectQuality = ::selectQuality,
                                    interaction = interaction,
                                    onAutoHide = { controlsVisible = false },
                                )
                                val upNext = next?.takeIf { ended && !nextCancelled }
                                nextVisible = upNext != null
                                upNext?.let { TvNextEpisode(it, ::playNext, { nextCancelled = true }, Modifier.align(Alignment.BottomEnd)) }
                                seekHint?.let {
                                    Text(
                                        it,
                                        color = MavrosColors.Foreground,
                                        style = MaterialTheme.typography.titleLarge,
                                        modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 48.dp)
                                            .background(Color.Black.copy(alpha = 0.6f)).padding(horizontal = 20.dp, vertical = 10.dp),
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    /** Control remoto (TV-06): ver [tvPlayerAction] */
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (nextVisible) {
            // Atrás quita el aviso; lo demás es de "Ver ahora" / "Cancelar"
            if (event.keyCode == KeyEvent.KEYCODE_BACK) {
                if (event.action == KeyEvent.ACTION_UP) nextCancelled = true
                return true
            }
            return super.dispatchKeyEvent(event)
        }
        val action = tvPlayerAction(event.keyCode, controlsVisible) ?: return super.dispatchKeyEvent(event)
        if (failed && action != TvPlayerAction.Exit) return super.dispatchKeyEvent(event) // "Reintentar" recibe el OK
        interaction++
        if (action == TvPlayerAction.ToControls) return super.dispatchKeyEvent(event) // foco y OK de los botones
        if (event.action != KeyEvent.ACTION_DOWN) return true
        when (action) {
            TvPlayerAction.ShowControls -> controlsVisible = true
            TvPlayerAction.HideControls -> controlsVisible = false
            TvPlayerAction.TogglePlay -> togglePlay()
            TvPlayerAction.SeekBack -> seekWithHint { player.seekBack() }
            TvPlayerAction.SeekForward -> seekWithHint { player.seekForward() }
            TvPlayerAction.Exit -> finish()
            TvPlayerAction.ToControls -> Unit
        }
        return true
    }

    /** Siguiente episodio sin salir del reproductor (SER-16) */
    private fun playNext(next: Movie) {
        ended = false
        nextCancelled = false
        controlsVisible = false
        selectedHeight = null
        intent = intent(this, next, 0.0)
        current = Current(next.id, next.title, next.durationSeconds, 0.0)
    }

    private fun togglePlay() = if (player.isPlaying) player.pause() else player.play()

    private fun seekWithHint(seek: () -> Unit) {
        seek()
        if (!controlsVisible) {
            positionMs = player.currentPosition
            durationMs = player.duration.coerceAtLeast(0)
            seekHint = "${formatTimestamp(positionMs / 1000.0)} / ${formatTimestamp(durationMs / 1000.0)}"
        }
    }

    /** Igual que el teléfono (MOB-14): una resolución fija o "Automática" */
    private fun selectQuality(height: Int?) {
        selectedHeight = height
        val builder = player.trackSelectionParameters.buildUpon().clearOverridesOfType(C.TRACK_TYPE_VIDEO)
        if (height != null) {
            player.currentTracks.groups.filter { it.type == C.TRACK_TYPE_VIDEO }.forEach { group ->
                for (i in 0 until group.length) {
                    if (group.getTrackFormat(i).height == height) {
                        builder.setOverrideForType(TrackSelectionOverride(group.mediaTrackGroup, i))
                        player.trackSelectionParameters = builder.build()
                        return
                    }
                }
            }
        }
        player.trackSelectionParameters = builder.build()
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
