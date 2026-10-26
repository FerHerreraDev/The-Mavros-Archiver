package com.mavros.archiver.core.design

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import coil3.request.crossfade
import com.mavros.archiver.core.model.Movie
import com.mavros.archiver.core.model.ThumbHash

/** ThumbHash -> bitmap diminuto (≤32 px). Se estira con filtrado bilineal: se ve como el póster borroso. */
fun thumbhashBitmap(hash: String?): ImageBitmap? {
    val bytes = ThumbHash.fromBase64(hash) ?: return null
    val image = ThumbHash.toRgba(bytes)
    val pixels = IntArray(image.width * image.height) { i ->
        val r = image.rgba[i * 4].toInt() and 0xFF
        val g = image.rgba[i * 4 + 1].toInt() and 0xFF
        val b = image.rgba[i * 4 + 2].toInt() and 0xFF
        val a = image.rgba[i * 4 + 3].toInt() and 0xFF
        (a shl 24) or (r shl 16) or (g shl 8) or b
    }
    return Bitmap.createBitmap(pixels, image.width, image.height, Bitmap.Config.ARGB_8888).asImageBitmap()
}

/**
 * Póster con vista previa instantánea (LOAD-02): el ThumbHash se ve desde el primer cuadro y
 * la imagen real se funde encima (300 ms; sin fundido con "Quitar animaciones").
 * Sin URL o si la imagen falla se muestra [fallback].
 */
@Composable
fun PosterImage(movie: Movie, modifier: Modifier = Modifier, fallback: @Composable () -> Unit) {
    val placeholder = remember(movie.posterThumbhash) { thumbhashBitmap(movie.posterThumbhash) }
    var failed by remember(movie.posterSrc) { mutableStateOf(false) }
    val reduceMotion = rememberReduceMotion()
    val context = LocalContext.current

    Box(modifier) {
        if (movie.posterSrc == null || failed) {
            fallback()
            return@Box
        }
        if (placeholder != null) {
            Image(
                placeholder,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize().testTag("poster-placeholder-${movie.id}"),
            )
        }
        val request = remember(movie.posterSrc, reduceMotion) {
            ImageRequest.Builder(context)
                .data(movie.posterSrc)
                .crossfade(if (reduceMotion) 0 else REVEAL_FADE_MS)
                .build()
        }
        AsyncImage(
            model = request,
            contentDescription = null,
            contentScale = ContentScale.Crop,
            onError = { failed = true },
            modifier = Modifier.fillMaxSize().testTag("poster-image-${movie.id}"),
        )
    }
}
