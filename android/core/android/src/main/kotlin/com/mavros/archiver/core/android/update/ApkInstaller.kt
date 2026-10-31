package com.mavros.archiver.core.android.update

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.net.Uri
import android.provider.Settings
import com.mavros.archiver.core.model.AppRelease
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.withContext
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/** El APK bajado no es el publicado (UPD-05) */
class CorruptApkException : IOException("El SHA-256 del APK no coincide")

/** Qué pasó con el instalador del sistema */
sealed interface InstallResult {
    /** El usuario cerró o canceló el instalador */
    data object Cancelled : InstallResult
    data class Failed(val message: String?) : InstallResult
}

/** Descarga e instalación de una versión nueva (UPD-05). Interfaz para probar el ViewModel sin Android. */
interface ApkInstaller {
    /** Baja el APK y comprueba su SHA-256; [onProgress] de 0 a 1 (null si no se sabe el tamaño) */
    suspend fun download(release: AppRelease, onProgress: (Float?) -> Unit): File
    /** ¿El sistema deja que esta app instale? */
    fun canInstall(): Boolean
    /** Abre el ajuste "Instalar apps desconocidas" de esta app; false si el aparato no lo tiene */
    fun openInstallSettings(): Boolean
    /** Abre el instalador del sistema con [apk] */
    fun install(apk: File)
    val results: SharedFlow<InstallResult>
}

/** Resultados que llegan del sistema al receptor (uno por proceso) */
internal object InstallEvents {
    val results = MutableSharedFlow<InstallResult>(extraBufferCapacity = 4)
}

fun sha256Hex(file: File): String {
    val digest = MessageDigest.getInstance("SHA-256")
    file.inputStream().use { input ->
        val buffer = ByteArray(64 * 1024)
        while (true) {
            val n = input.read(buffer)
            if (n < 0) break
            digest.update(buffer, 0, n)
        }
    }
    return digest.digest().joinToString("") { "%02x".format(it) }
}

class AndroidApkInstaller(context: Context) : ApkInstaller {
    private val app = context.applicationContext
    private val dir get() = File(app.cacheDir, "updates").apply { mkdirs() }

    override val results: SharedFlow<InstallResult> = InstallEvents.results

    override suspend fun download(release: AppRelease, onProgress: (Float?) -> Unit): File = withContext(Dispatchers.IO) {
        val target = File(dir, "${release.versionCode}.apk")
        // Otra versión que quedó a medias o vieja no ocupa espacio
        dir.listFiles()?.filter { it != target }?.forEach { it.delete() }
        if (target.exists() && sha256Hex(target) == release.sha256) return@withContext target.also { onProgress(1f) }

        val part = File(dir, "${release.versionCode}.apk.part")
        val connection = URL(release.url).openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 15_000
            connection.readTimeout = 30_000
            if (connection.responseCode != HttpURLConnection.HTTP_OK) throw IOException("HTTP ${connection.responseCode}")
            val total = connection.contentLengthLong.takeIf { it > 0 }
            val digest = MessageDigest.getInstance("SHA-256")
            connection.inputStream.use { input ->
                part.outputStream().use { output ->
                    val buffer = ByteArray(64 * 1024)
                    var read = 0L
                    while (true) {
                        val n = input.read(buffer)
                        if (n < 0) break
                        output.write(buffer, 0, n)
                        digest.update(buffer, 0, n)
                        read += n
                        onProgress(total?.let { (read.toFloat() / it).coerceIn(0f, 1f) })
                    }
                }
            }
            val hex = digest.digest().joinToString("") { "%02x".format(it) }
            if (hex != release.sha256) {
                part.delete()
                throw CorruptApkException()
            }
            if (!part.renameTo(target)) throw IOException("No pude guardar el APK")
            target
        } finally {
            connection.disconnect()
            part.delete()
        }
    }

    override fun canInstall(): Boolean = app.packageManager.canRequestPackageInstalls()

    override fun openInstallSettings(): Boolean {
        val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${app.packageName}"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (intent.resolveActivity(app.packageManager) == null) return false
        return runCatching { app.startActivity(intent) }.isSuccess
    }

    override fun install(apk: File) {
        val installer = app.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
            setAppPackageName(app.packageName)
        }
        val sessionId = installer.createSession(params)
        installer.openSession(sessionId).use { session ->
            session.openWrite("mavros.apk", 0, apk.length()).use { out ->
                apk.inputStream().use { it.copyTo(out) }
                session.fsync(out)
            }
            val callback = PendingIntent.getBroadcast(
                app,
                sessionId,
                Intent(app, InstallResultReceiver::class.java).setPackage(app.packageName),
                // MUTABLE: el sistema agrega el estado y el intent de confirmación
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
            )
            session.commit(callback.intentSender)
        }
    }
}

/** Recibe lo que dice el instalador del sistema (UPD-05) */
class InstallResultReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
            // El sistema pide confirmar (y, si hace falta, permitir esta fuente): se abre su pantalla
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                @Suppress("DEPRECATION")
                val confirm = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT) ?: return
                context.startActivity(confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }
            // Instalada: el sistema reinicia la app con la versión nueva
            PackageInstaller.STATUS_SUCCESS -> Unit
            PackageInstaller.STATUS_FAILURE_ABORTED -> InstallEvents.results.tryEmit(InstallResult.Cancelled)
            else -> InstallEvents.results.tryEmit(
                InstallResult.Failed(intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: "estado $status"),
            )
        }
    }
}
