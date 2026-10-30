package com.mavros.archiver.mobile.player

import com.mavros.archiver.core.android.player.PlayerUiState
import com.mavros.archiver.core.android.player.TrackChoices
import com.mavros.archiver.core.android.player.TrackPreferences
import com.mavros.archiver.core.android.player.withAudio
import com.mavros.archiver.core.android.player.withSubtitles
import com.mavros.archiver.core.model.TrackRules
import com.mavros.archiver.core.android.player.PlayerViewModel
import com.mavros.archiver.core.android.player.UpNext
import com.mavros.archiver.core.android.player.qualityLabels

import android.app.PictureInPictureParams
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Rational
import androidx.activity.ComponentActivity
import androidx.activity.addCallback
import androidx.activity.compose.setContent
import androidx.annotation.OptIn
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.foundation.layout.fillMaxSize
import androidx.core.content.ContextCompat
import androidx.core.os.bundleOf
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.Tracks
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import androidx.media3.ui.PlayerView
import com.google.common.util.concurrent.ListenableFuture
import com.mavros.archiver.core.design.MavrosTheme
import com.mavros.archiver.core.model.Movie
import com.mavros.archiver.mobile.MainActivity
import com.mavros.archiver.mobile.MavrosApplication

/**
 * Reproductor a pantalla completa (MOB-13, MOB-14, MOB-17). El reproductor real vive en
 * [PlaybackService]; esta pantalla se conecta con un MediaController.
 */
@OptIn(UnstableApi::class)
class PlayerActivity : ComponentActivity() {
    companion object {
        private const val MOVIE_ID = "movieId"
        private const val TITLE = "title"
        private const val DURATION = "duration"
        private const val START_AT = "startAt"
        private const val LIST_ID = "listId"

        /** Con [listId], al terminar ofrece lo siguiente de esa lista (PL-07) */
        fun intent(context: Context, movie: Movie, startAtSeconds: Double, listId: String? = null): Intent =
            Intent(context, PlayerActivity::class.java)
                .putExtra(MOVIE_ID, movie.id)
                .putExtra(TITLE, movie.title)
                .putExtra(DURATION, movie.durationSeconds)
                .putExtra(START_AT, startAtSeconds)
                .putExtra(LIST_ID, listId)
    }

    private var controllerFuture: ListenableFuture<MediaController>? = null
    private var controller by mutableStateOf<MediaController?>(null)
    private var inPip by mutableStateOf(false)
    private var controlsVisible by mutableStateOf(true)
    private var buffering by mutableStateOf(false)
    private var playbackFailed by mutableStateOf(false)
    private var videoHeights by mutableStateOf(emptyList<Int>())
    private var selectedHeight by mutableStateOf<Int?>(null)
    private var tracks by mutableStateOf(TrackChoices())
    private val trackPreferences by lazy { TrackPreferences(this) }
    private var ended by mutableStateOf(false)
    private var nextCancelled by mutableStateOf(false)

    /** Lo que se está viendo; cambia al pasar al siguiente episodio sin salir (SER-16) */
    private data class Current(val id: String, val title: String, val duration: Int, val startAt: Double)
    private var current by mutableStateOf(Current("", "", 0, 0.0))
    private val movieId get() = current.id

    private val listener = object : Player.Listener {
        override fun onPlaybackStateChanged(state: Int) {
            buffering = state == Player.STATE_BUFFERING
            if (state == Player.STATE_READY) playbackFailed = false
            ended = state == Player.STATE_ENDED
        }
        override fun onPlayerError(error: PlaybackException) { playbackFailed = true }
        override fun onTracksChanged(tracks: Tracks) {
            videoHeights = heightsOf(tracks)
            this@PlayerActivity.tracks = TrackChoices.of(tracks)
        }
        override fun onIsPlayingChanged(isPlaying: Boolean) { updatePipParams(isPlaying) }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Pantalla completa inmersiva: barras del sistema ocultas, aparecen con un gesto
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
        val container = (application as MavrosApplication).container
        current = Current(
            intent.getStringExtra(MOVIE_ID).orEmpty(),
            intent.getStringExtra(TITLE).orEmpty(),
            intent.getIntExtra(DURATION, 0),
            intent.getDoubleExtra(START_AT, 0.0),
        )

        setContent {
            MavrosTheme {
                val movie = current
                // Una por película: al pasar al siguiente episodio se pide su propia URL (SER-16)
                val listId = intent.getStringExtra(LIST_ID)
                val vm: PlayerViewModel = viewModel(key = movie.id, factory = viewModelFactory {
                    initializer { PlayerViewModel(container.playback, movie.id, container.catalog, container.playlists, listId) }
                })
                val state by vm.state.collectAsStateWithLifecycle()
                val next by vm.next.collectAsStateWithLifecycle()
                val player = controller

                // Con URL y controlador listos: se arranca (una sola vez por película)
                LaunchedEffect(state, player) {
                    val ready = state as? PlayerUiState.Ready ?: return@LaunchedEffect
                    player ?: return@LaunchedEffect
                    if (player.currentMediaItem?.mediaId == movie.id && player.playbackState != Player.STATE_IDLE) return@LaunchedEffect
                    player.setMediaItem(mediaItem(movie.title, movie.duration, ready), (movie.startAt * 1000).toLong())
                    player.prepare()
                    player.play()
                }

                PlayerScreen(
                    state = state,
                    title = movie.title,
                    inPip = inPip,
                    controlsVisible = controlsVisible,
                    buffering = buffering,
                    playbackFailed = playbackFailed,
                    qualities = qualityLabels(videoHeights),
                    selectedQuality = selectedHeight,
                    onSelectQuality = ::selectQuality,
                    onBack = ::leave,
                    onRetry = {
                        if (state is PlayerUiState.Ready && playbackFailed) {
                            playbackFailed = false
                            controller?.prepare()
                            controller?.play()
                        } else vm.retry()
                    },
                    tracks = tracks,
                    onSelectAudio = ::selectAudio,
                    onSelectSubtitles = ::selectSubtitles,
                    nextEpisode = next?.takeIf { ended && !nextCancelled && !inPip },
                    onPlayNext = ::playNext,
                    onCancelNext = { nextCancelled = true },
                ) {
                    AndroidView(
                        factory = { context ->
                            PlayerView(context).apply {
                                keepScreenOn = true // MOB-14
                                setShowBuffering(PlayerView.SHOW_BUFFERING_NEVER) // el loader lo dibuja Compose
                                setShowNextButton(false)
                                setShowPreviousButton(false)
                                setShowSubtitleButton(false)
                                setControllerVisibilityListener(PlayerView.ControllerVisibilityListener { controlsVisible = it == android.view.View.VISIBLE })
                            }
                        },
                        update = { view ->
                            view.player = player
                            view.useController = !inPip
                        },
                        modifier = Modifier.fillMaxSize().testTag("player-video"),
                    )
                }
            }
        }
        updatePipParams(false)
        onBackPressedDispatcher.addCallback(this) { leave() }
    }

    /** Siguiente episodio o de la lista sin salir del reproductor: su propia URL, token y progreso (SER-16, PL-07) */
    private fun playNext(next: UpNext) {
        ended = false
        nextCancelled = false
        selectedHeight = null
        // Si Android recrea la pantalla, sigue en este; en modo lista, sigue en la lista
        intent = intent(this, next.movie, next.startAt, intent.getStringExtra(LIST_ID))
        current = Current(next.movie.id, next.movie.title, next.movie.durationSeconds, next.startAt)
    }

    /**
     * El reproductor vive en su propia tarea (necesario para PiP y para abrirlo desde la
     * notificación): al salir se trae al frente la tarea de la app, con el detalle como estaba.
     */
    private fun leave() {
        startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        finish()
    }

    override fun onStart() {
        super.onStart()
        if (controllerFuture != null) return
        val token = SessionToken(this, ComponentName(this, PlaybackService::class.java))
        val future = MediaController.Builder(this, token).buildAsync()
        controllerFuture = future
        future.addListener({
            val c = runCatching { future.get() }.getOrNull() ?: return@addListener
            c.addListener(listener)
            videoHeights = heightsOf(c.currentTracks)
            tracks = TrackChoices.of(c.currentTracks)
            controller = c
        }, ContextCompat.getMainExecutor(this))
    }

    override fun onStop() {
        super.onStop()
        // Se cerró la ventana de PiP: se pausa (el progreso se guarda al pausar)
        if (inPip) controller?.pause()
    }

    override fun onDestroy() {
        if (isFinishing) {
            // Salir del reproductor (atrás): pausa → se guarda; luego se detiene
            controller?.pause()
            controller?.stop()
            controller?.clearMediaItems()
        }
        controller?.removeListener(listener)
        controllerFuture?.let { MediaController.releaseFuture(it) }
        controllerFuture = null
        controller = null
        super.onDestroy()
    }

    // --- Picture-in-Picture (MOB-17) -------------------------------------

    private fun updatePipParams(isPlaying: Boolean) {
        val builder = PictureInPictureParams.Builder().setAspectRatio(Rational(16, 9))
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) builder.setAutoEnterEnabled(isPlaying)
        runCatching { setPictureInPictureParams(builder.build()) }
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        // Android 11 y anteriores no entran solos: se pide al salir a inicio mientras reproduce
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S && controller?.isPlaying == true) {
            runCatching { enterPictureInPictureMode(PictureInPictureParams.Builder().setAspectRatio(Rational(16, 9)).build()) }
        }
    }

    override fun onPictureInPictureModeChanged(isInPictureInPictureMode: Boolean, newConfig: Configuration) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
        inPip = isInPictureInPictureMode
    }

    // --- Audio y subtítulos (MOB-20) -------------------------------------

    private fun selectAudio(language: String) {
        val c = controller ?: return
        trackPreferences.audioLanguage = language
        c.trackSelectionParameters = c.trackSelectionParameters.withAudio(language)
    }

    /** null = apagados */
    private fun selectSubtitles(language: String?) {
        val c = controller ?: return
        trackPreferences.subtitlesLanguage = language ?: TrackRules.OFF
        c.trackSelectionParameters = c.trackSelectionParameters.withSubtitles(language)
    }

    // --- Calidad (MOB-14) -------------------------------------------------

    private fun selectQuality(height: Int?) {
        val c = controller ?: return
        selectedHeight = height
        val builder = c.trackSelectionParameters.buildUpon().clearOverridesOfType(C.TRACK_TYPE_VIDEO)
        if (height != null) {
            c.currentTracks.groups.filter { it.type == C.TRACK_TYPE_VIDEO }.forEach { group ->
                for (i in 0 until group.length) {
                    if (group.getTrackFormat(i).height == height) {
                        builder.setOverrideForType(TrackSelectionOverride(group.mediaTrackGroup, i))
                        c.trackSelectionParameters = builder.build()
                        return
                    }
                }
            }
        }
        c.trackSelectionParameters = builder.build()
    }

    private fun heightsOf(tracks: Tracks): List<Int> =
        tracks.groups.filter { it.type == C.TRACK_TYPE_VIDEO }.flatMap { g -> (0 until g.length).map { g.getTrackFormat(it).height } }

    private fun mediaItem(title: String, duration: Int, ready: PlayerUiState.Ready): MediaItem =
        MediaItem.Builder()
            .setMediaId(movieId)
            .setMediaMetadata(MediaMetadata.Builder().setTitle(title).setArtist("The Mavros Archiver").build())
            .setRequestMetadata(
                MediaItem.RequestMetadata.Builder()
                    .setMediaUri(Uri.parse(ready.source.url))
                    .setExtras(bundleOf(PlaybackExtras.EXPIRES_AT_MS to ready.source.expiresAtMs, PlaybackExtras.DURATION_SECONDS to duration))
                    .build(),
            )
            .build()
}
