package com.mavros.archiver.core.model

import java.util.Base64
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Decodificador de ThumbHash (https://evanw.github.io/thumbhash/), traducido línea por línea de la
 * implementación de referencia en JavaScript que usa la web (paquete `thumbhash`), para que ambas
 * vistas previas salgan idénticas (LOAD-04).
 *
 * El hash guarda el color promedio, la proporción y unos pocos coeficientes DCT en ~25 bytes;
 * decodificarlo da una imagen de ≤32 px por lado que, estirada, se ve como el póster borroso.
 */
object ThumbHash {
    class Image(val width: Int, val height: Int, val rgba: ByteArray)
    data class Rgba(val r: Float, val g: Float, val b: Float, val a: Float)

    /** Base64 (lo que guarda la columna poster_thumbhash) -> bytes; null si no es válido */
    fun fromBase64(value: String?): ByteArray? {
        if (value.isNullOrBlank()) return null
        val bytes = runCatching { Base64.getDecoder().decode(value) }.getOrNull() ?: return null
        return bytes.takeIf { isValid(it) }
    }

    /** Los hashes truncados o con proporción imposible se descartan antes de decodificar */
    fun isValid(hash: ByteArray): Boolean {
        if (hash.size < 5) return false
        val ratio = approximateAspectRatio(hash)
        return ratio.isFinite() && ratio > 0.0
    }

    fun approximateAspectRatio(hash: ByteArray): Double {
        val header = hash.u8(3)
        val hasAlpha = hash.u8(2) and 0x80 != 0
        val isLandscape = hash.u8(4) and 0x80 != 0
        val lx = if (isLandscape) (if (hasAlpha) 5 else 7) else header and 7
        val ly = if (isLandscape) header and 7 else if (hasAlpha) 5 else 7
        return lx.toDouble() / ly.toDouble()
    }

    fun averageRgba(hash: ByteArray): Rgba {
        val header = hash.u8(0) or (hash.u8(1) shl 8) or (hash.u8(2) shl 16)
        val l = (header and 63) / 63.0
        val p = ((header shr 6) and 63) / 31.5 - 1
        val q = ((header shr 12) and 63) / 31.5 - 1
        val hasAlpha = header shr 23 != 0
        val a = if (hasAlpha) (hash.u8(5) and 15) / 15.0 else 1.0
        val b = l - 2.0 / 3.0 * p
        val r = (3 * l - b + q) / 2
        val g = r - q
        return Rgba(r.clamp01().toFloat(), g.clamp01().toFloat(), b.clamp01().toFloat(), a.toFloat())
    }

    /** Hash -> píxeles RGBA (sin premultiplicar), igual que thumbHashToRGBA de la web */
    fun toRgba(hash: ByteArray): Image {
        require(isValid(hash)) { "ThumbHash inválido" }

        val header24 = hash.u8(0) or (hash.u8(1) shl 8) or (hash.u8(2) shl 16)
        val header16 = hash.u8(3) or (hash.u8(4) shl 8)
        val lDc = (header24 and 63) / 63.0
        val pDc = ((header24 shr 6) and 63) / 31.5 - 1
        val qDc = ((header24 shr 12) and 63) / 31.5 - 1
        val lScale = ((header24 shr 18) and 31) / 31.0
        val hasAlpha = header24 shr 23 != 0
        val pScale = ((header16 shr 3) and 63) / 63.0
        val qScale = ((header16 shr 9) and 63) / 63.0
        val isLandscape = header16 shr 15 != 0
        val lx = max(3, if (isLandscape) (if (hasAlpha) 5 else 7) else header16 and 7)
        val ly = max(3, if (isLandscape) header16 and 7 else if (hasAlpha) 5 else 7)
        val aDc = if (hasAlpha) (hash.u8(5) and 15) / 15.0 else 1.0
        val aScale = (hash.u8(5) shr 4) / 15.0

        // Coeficientes AC: 4 bits cada uno (saturación ×1.25 para compensar la cuantización)
        val acStart = if (hasAlpha) 6 else 5
        var acIndex = 0
        fun decodeChannel(nx: Int, ny: Int, scale: Double): DoubleArray {
            val ac = ArrayList<Double>()
            for (cy in 0 until ny) {
                var cx = if (cy != 0) 0 else 1
                while (cx * ny < nx * (ny - cy)) {
                    val nibble = (hash.u8(acStart + (acIndex shr 1)) shr ((acIndex and 1) shl 2)) and 15
                    ac.add((nibble / 7.5 - 1) * scale)
                    acIndex++
                    cx++
                }
            }
            return ac.toDoubleArray()
        }
        val lAc = decodeChannel(lx, ly, lScale)
        val pAc = decodeChannel(3, 3, pScale * 1.25)
        val qAc = decodeChannel(3, 3, qScale * 1.25)
        val aAc = if (hasAlpha) decodeChannel(5, 5, aScale) else null

        // DCT inversa a RGB
        val ratio = approximateAspectRatio(hash)
        val w = jsRound(if (ratio > 1) 32.0 else 32.0 * ratio)
        val h = jsRound(if (ratio > 1) 32.0 / ratio else 32.0)
        val rgba = ByteArray(w * h * 4)
        val fx = DoubleArray(max(lx, if (hasAlpha) 5 else 3))
        val fy = DoubleArray(max(ly, if (hasAlpha) 5 else 3))
        var i = 0
        for (y in 0 until h) {
            for (x in 0 until w) {
                var l = lDc
                var p = pDc
                var q = qDc
                var a = aDc

                for (cx in fx.indices) fx[cx] = cos(PI / w * (x + 0.5) * cx)
                for (cy in fy.indices) fy[cy] = cos(PI / h * (y + 0.5) * cy)

                var j = 0
                for (cy in 0 until ly) {
                    val fy2 = fy[cy] * 2
                    var cx = if (cy != 0) 0 else 1
                    while (cx * ly < lx * (ly - cy)) {
                        l += lAc[j] * fx[cx] * fy2
                        cx++
                        j++
                    }
                }

                j = 0
                for (cy in 0 until 3) {
                    val fy2 = fy[cy] * 2
                    var cx = if (cy != 0) 0 else 1
                    while (cx < 3 - cy) {
                        val f = fx[cx] * fy2
                        p += pAc[j] * f
                        q += qAc[j] * f
                        cx++
                        j++
                    }
                }

                if (aAc != null) {
                    j = 0
                    for (cy in 0 until 5) {
                        val fy2 = fy[cy] * 2
                        var cx = if (cy != 0) 0 else 1
                        while (cx < 5 - cy) {
                            a += aAc[j] * fx[cx] * fy2
                            cx++
                            j++
                        }
                    }
                }

                val b = l - 2.0 / 3.0 * p
                val r = (3 * l - b + q) / 2
                val g = r - q
                rgba[i] = channel(r)
                rgba[i + 1] = channel(g)
                rgba[i + 2] = channel(b)
                rgba[i + 3] = channel(a)
                i += 4
            }
        }
        return Image(w, h, rgba)
    }

    // JS: Uint8Array trunca (no redondea) al guardar max(0, 255 * min(1, v))
    private fun channel(v: Double): Byte = max(0.0, 255 * min(1.0, v)).toInt().toByte()

    // JS Math.round: .5 sube siempre (Kotlin roundToInt hace lo mismo para positivos)
    private fun jsRound(v: Double): Int = v.roundToInt()

    private fun Double.clamp01() = max(0.0, min(1.0, this))

    // JS lee fuera del arreglo como undefined -> 0 en operaciones de bits
    private fun ByteArray.u8(index: Int): Int = if (index in indices) this[index].toInt() and 0xFF else 0
}
