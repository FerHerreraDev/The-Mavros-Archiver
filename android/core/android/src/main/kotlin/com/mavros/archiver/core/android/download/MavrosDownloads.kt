package com.mavros.archiver.core.android.download

import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.StreamKey
import androidx.media3.common.util.UnstableApi
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.ResolvingDataSource
import androidx.media3.datasource.cache.Cache
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.CacheKeyFactory
import androidx.media3.datasource.cache.NoOpCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import androidx.media3.exoplayer.DefaultRenderersFactory
import androidx.media3.exoplayer.offline.DefaultDownloadIndex
import androidx.media3.exoplayer.offline.DefaultDownloaderFactory
import androidx.media3.exoplayer.offline.Download
import androidx.media3.exoplayer.offline.DownloadHelper
import androidx.media3.exoplayer.offline.DownloadManager
import androidx.media3.exoplayer.offline.DownloadRequest
import androidx.media3.exoplayer.offline.DownloadService
import com.mavros.archiver.core.data.CatalogRepository
import com.mavros.archiver.core.data.DataError
import com.mavros.archiver.core.data.DataResult
import com.mavros.archiver.core.data.PlaybackRepository
import com.mavros.archiver.core.data.PlaybackSource
import com.mavros.archiver.core.model.DownloadRules
import com.mavros.archiver.core.model.PlaybackRules
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

private const val TAG = "MavrosDownloads"

/** Lo que se guarda de cada película descargada para mostrarla sin internet (DL-03) */
data class OfflineMovie(
    val id: String,
    val title: String,
    val durationSeconds: Int,
    val posterSrc: String? = null,
    /** Para un episodio: "Arcane · T1:E2" */
    val subtitle: String? = null,
) {
    fun toBytes(): ByteArray = JSONObject()
        .put("id", id).put("title", title).put("duration", durationSeconds)
        .putOpt("poster", posterSrc).putOpt("subtitle", subtitle)
        .toString().toByteArray()

    companion object {
        fun fromBytes(bytes: ByteArray?, fallbackId: String): OfflineMovie {
            val json = runCatching { JSONObject(String(bytes ?: ByteArray(0))) }.getOrNull() ?: JSONObject()
            return OfflineMovie(
                id = json.optString("id", fallbackId),
                title = json.optString("title", ""),
                durationSeconds = json.optInt("duration", 0),
                posterSrc = json.optString("poster").takeIf { it.isNotEmpty() },
                subtitle = json.optString("subtitle").takeIf { it.isNotEmpty() },
            )
        }
    }
}

enum class OfflineState { Preparing, Queued, Downloading, Completed, Failed }

data class OfflineItem(val movie: OfflineMovie, val state: OfflineState, val percent: Float? = null, val bytes: Long = 0)

/** Lo que las pantallas usan de las descargas (DL-01, DL-03); interfaz para probarlas sin Media3 */
interface OfflineDownloads {
    val items: StateFlow<Map<String, OfflineItem>>
    /** Lanza [DownloadStartException] si no se pudo preparar (sin red, ya no existe) */
    suspend fun start(movie: OfflineMovie)
    fun remove(movieId: String)
}

/** Por qué no se pudo empezar una descarga */
class DownloadStartException(val error: DataError?) : IOException("No se pudo preparar la descarga")

/**
 * Descargas para ver sin internet (DL-01..DL-07), solo en el teléfono.
 * - Una caché en el almacenamiento privado de la app, compartida con el reproductor: lo descargado se
 *   reproduce de ahí (con o sin internet).
 * - La clave de cada archivo ignora el token (DL-07); cada petición lleva el token más reciente de su
 *   película y, si está por caducar, se pide otro antes de seguir (DL-02).
 */
@OptIn(UnstableApi::class)
class MavrosDownloads(
    context: Context,
    private val playback: PlaybackRepository,
    private val catalog: CatalogRepository,
    private val scope: CoroutineScope,
    private val serviceClass: Class<out DownloadService>,
) : OfflineDownloads {
    private val app = context.applicationContext
    private val database = StandaloneDatabaseProvider(app)

    /** Una sola instancia por carpeta (SimpleCache no permite dos) */
    val cache: Cache = SimpleCache(File(app.filesDir, "downloads"), NoOpCacheEvictor(), database)
    val cacheKeyFactory = CacheKeyFactory { spec -> spec.key ?: DownloadRules.cacheKey(spec.uri.toString()) }

    /** URL firmada vigente de cada película, por su carpeta sin token */
    private data class Token(val movieId: String, val folder: String, @Volatile var source: PlaybackSource)
    private val tokens = ConcurrentHashMap<String, Token>()
    private val refreshes = ConcurrentHashMap<String, Int>()

    private val http = DefaultHttpDataSource.Factory().setAllowCrossProtocolRedirects(false)

    /** HTTP con el token al día de la película a la que pertenece cada URL (DL-02) */
    val upstream: DataSource.Factory = ResolvingDataSource.Factory(http) { spec ->
        val key = DownloadRules.cacheKey(spec.uri.toString())
        val token = tokens.values.firstOrNull { key.startsWith(it.folder) } ?: return@Factory spec
        // Hilo de carga: se puede esperar a la URL nueva
        if (token.source.expiresAtMs - System.currentTimeMillis() < 2 * 60_000) runBlocking { refresh(token) }
        spec.withUri(Uri.parse(PlaybackRules.swapToken(spec.uri.toString(), token.source.url)))
    }

    /** Escribe en la caché con la misma clave sin token que lee el reproductor (DL-07) */
    private val writer = CacheDataSource.Factory().setCache(cache).setCacheKeyFactory(cacheKeyFactory).setUpstreamDataSourceFactory(upstream)

    val manager = DownloadManager(app, DefaultDownloadIndex(database), DefaultDownloaderFactory(writer, Executors.newFixedThreadPool(4))).apply {
        maxParallelDownloads = 1
        minRetryCount = 3
    }

    private val _items = MutableStateFlow<Map<String, OfflineItem>>(emptyMap())
    override val items: StateFlow<Map<String, OfflineItem>> = _items
    private val preparing = ConcurrentHashMap<String, OfflineMovie>()
    private var poll: Job? = null
    private val main = Handler(Looper.getMainLooper())

    init {
        manager.addListener(object : DownloadManager.Listener {
            override fun onInitialized(downloadManager: DownloadManager) = publish()
            override fun onDownloadChanged(downloadManager: DownloadManager, download: Download, finalException: Exception?) {
                if (download.state == Download.STATE_FAILED) retryWithFreshToken(download)
                if (download.state == Download.STATE_COMPLETED) refreshes.remove(download.request.id)
                publish()
            }
            override fun onDownloadRemoved(downloadManager: DownloadManager, download: Download) {
                tokens.values.removeAll { it.movieId == download.request.id }
                publish()
            }
        })
        publish()
    }

    private suspend fun refresh(token: Token) {
        when (val result = playback.source(token.movieId)) {
            is DataResult.Success -> result.value?.let { token.source = it }
            is DataResult.Failure -> Unit
        }
    }

    /** DL-02: el enlace caducó (403) o se cortó: URL nueva y sigue desde donde iba, hasta 3 veces */
    private fun retryWithFreshToken(download: Download) {
        val id = download.request.id
        val attempts = (refreshes[id] ?: 0) + 1
        if (attempts > 3) return
        refreshes[id] = attempts
        scope.launch {
            val result = playback.source(id)
            val source = (result as? DataResult.Success)?.value ?: return@launch
            remember(id, source)
            DownloadService.sendAddDownload(app, serviceClass, download.request.copyWithUri(source.url), false)
        }
    }

    private fun DownloadRequest.copyWithUri(url: String) =
        DownloadRequest.Builder(id, Uri.parse(url)).setMimeType(mimeType).setStreamKeys(streamKeys).setData(data).build()

    private fun remember(movieId: String, source: PlaybackSource) {
        val folder = DownloadRules.folderKey(source.url) ?: return
        tokens[folder] = Token(movieId, folder, source)
    }

    /** DL-01: una calidad (≤ 720p), todos los audios y subtítulos. Lanza [DownloadStartException]. */
    override suspend fun start(movie: OfflineMovie) {
        if (preparing.containsKey(movie.id) || _items.value[movie.id]?.state.let { it != null && it != OfflineState.Failed }) return
        preparing[movie.id] = movie
        publish()
        try {
            val source = when (val result = playback.source(movie.id)) {
                is DataResult.Success -> result.value ?: throw DownloadStartException(null)
                is DataResult.Failure -> throw DownloadStartException(result.error)
            }
            remember(movie.id, source)
            val request = withContext(Dispatchers.Main) { buildRequest(movie, source.url) }
            DownloadService.sendAddDownload(app, serviceClass, request, false)
        } catch (e: IOException) {
            Log.w(TAG, "No se pudo preparar la descarga de ${movie.id}", e)
            throw if (e is DownloadStartException) e else DownloadStartException(DataError.Network)
        } finally {
            preparing.remove(movie.id)
            publish()
        }
    }

    private suspend fun buildRequest(movie: OfflineMovie, url: String): DownloadRequest {
        val item = MediaItem.Builder().setUri(url).setMimeType(MimeTypes.APPLICATION_M3U8).build()
        val helper = DownloadHelper.Factory()
            .setDataSourceFactory(upstream)
            .setRenderersFactory(DefaultRenderersFactory(app))
            .setTrackSelectionParameters(DownloadHelper.getDefaultTrackSelectorParameters(app))
            .create(item)
        try {
            suspendCancellableCoroutine { cont ->
                helper.prepare(object : DownloadHelper.Callback {
                    override fun onPrepared(helper: DownloadHelper, tracksInfoAvailable: Boolean) = cont.resume(Unit)
                    override fun onPrepareError(helper: DownloadHelper, e: IOException) = cont.resumeWithException(e)
                })
            }
            if (helper.periodCount > 0) {
                val info = helper.getMappedTrackInfo(0)
                fun formats(type: Int) = (0 until info.rendererCount).filter { info.getRendererType(it) == type }.flatMap { r ->
                    val groups = info.getTrackGroups(r)
                    (0 until groups.length).flatMap { g -> (0 until groups[g].length).map { groups[g].getFormat(it) } }
                }
                val heights = formats(C.TRACK_TYPE_VIDEO).map { it.height }
                val audio = formats(C.TRACK_TYPE_AUDIO).mapNotNull { it.language }.distinct()
                val text = formats(C.TRACK_TYPE_TEXT).mapNotNull { it.language }.distinct()
                val height = DownloadRules.pickHeight(heights)
                if (height != null) {
                    helper.clearTrackSelections(0)
                    helper.addTrackSelection(
                        0,
                        DownloadHelper.getDefaultTrackSelectorParameters(app).buildUpon()
                            .setMaxVideoSize(Int.MAX_VALUE, height)
                            .setMinVideoSize(0, height)
                            .setForceHighestSupportedBitrate(true)
                            .build(),
                    )
                }
                if (audio.isNotEmpty()) helper.addAudioLanguagesToSelection(*audio.toTypedArray())
                if (text.isNotEmpty()) helper.addTextLanguagesToSelection(false, *text.toTypedArray())
            }
            return helper.getDownloadRequest(movie.id, movie.toBytes())
        } finally {
            helper.release()
        }
    }

    override fun remove(movieId: String) = DownloadService.sendRemoveDownload(app, serviceClass, movieId, false)

    /** DL-06: al cerrar sesión no queda nada */
    fun removeAll() = DownloadService.sendRemoveAllDownloads(app, serviceClass, false)

    private fun completed(movieId: String): Download? =
        manager.downloadIndex.getDownload(movieId)?.takeIf { it.state == Download.STATE_COMPLETED }

    /** URL de una película ya descargada: se reproduce sin pedir nada a la red (DL-04) */
    suspend fun localSource(movieId: String): PlaybackSource? = withContext(Dispatchers.IO) {
        completed(movieId)?.let { PlaybackSource(it.request.uri.toString(), Long.MAX_VALUE) }
    }

    /** Las calidades/idiomas descargados: el reproductor solo usa esos (si no, buscaría otras en la red) */
    fun streamKeys(movieId: String): List<StreamKey>? = completed(movieId)?.request?.streamKeys

    /** DL-06: lo que ya no se puede ver (despublicado) se borra; sin red no se toca nada */
    suspend fun prune() {
        for (id in _items.value.keys) {
            val result = catalog.movie(id)
            if (result is DataResult.Success && result.value == null) remove(id)
        }
    }

    private fun publish() {
        val downloads = manager.currentDownloads.associateBy { it.request.id }.toMutableMap()
        // Las terminadas no están en currentDownloads: se leen del índice
        runCatching {
            manager.downloadIndex.getDownloads().use { cursor ->
                while (cursor.moveToNext()) downloads.putIfAbsent(cursor.download.request.id, cursor.download)
            }
        }
        val items = downloads.values.mapNotNull { d ->
            val state = when (d.state) {
                Download.STATE_QUEUED, Download.STATE_RESTARTING, Download.STATE_STOPPED -> OfflineState.Queued
                Download.STATE_DOWNLOADING -> OfflineState.Downloading
                Download.STATE_COMPLETED -> OfflineState.Completed
                Download.STATE_FAILED -> OfflineState.Failed
                else -> return@mapNotNull null // borrándose
            }
            val percent = d.percentDownloaded.takeIf { it != C.PERCENTAGE_UNSET.toFloat() && it >= 0 }?.div(100f)
            d.request.id to OfflineItem(OfflineMovie.fromBytes(d.request.data, d.request.id), state, percent, d.bytesDownloaded)
        }.toMap() + preparing.mapValues { OfflineItem(it.value, OfflineState.Preparing) }
        _items.value = items
        // Mientras algo baja, el avance se actualiza cada segundo (DownloadManager no avisa del porcentaje)
        if (items.values.any { it.state == OfflineState.Downloading || it.state == OfflineState.Queued }) {
            if (poll?.isActive != true) poll = scope.launch {
                while (isActive) {
                    delay(1_000)
                    main.post { publish() }
                }
            }
        } else {
            poll?.cancel()
            poll = null
        }
    }
}
