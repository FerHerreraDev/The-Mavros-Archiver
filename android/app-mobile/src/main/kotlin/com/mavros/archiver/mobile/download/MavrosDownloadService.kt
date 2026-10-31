package com.mavros.archiver.mobile.download

import android.app.Notification
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.offline.Download
import androidx.media3.exoplayer.offline.DownloadManager
import androidx.media3.exoplayer.offline.DownloadNotificationHelper
import androidx.media3.exoplayer.offline.DownloadService
import androidx.media3.exoplayer.scheduler.Scheduler
import com.mavros.archiver.mobile.MavrosApplication
import com.mavros.archiver.mobile.R

/** Las descargas siguen con la app cerrada o la pantalla apagada, con su avance en la notificación (DL-01, DL-02) */
@OptIn(UnstableApi::class)
class MavrosDownloadService : DownloadService(NOTIFICATION_ID, DEFAULT_FOREGROUND_NOTIFICATION_UPDATE_INTERVAL, CHANNEL_ID, R.string.downloads_channel, 0) {
    private val notifications by lazy { DownloadNotificationHelper(this, CHANNEL_ID) }

    override fun getDownloadManager(): DownloadManager = (application as MavrosApplication).downloads.manager

    // Sin programador: si el sistema cierra el proceso, siguen al volver a abrir la app
    override fun getScheduler(): Scheduler? = null

    override fun getForegroundNotification(downloads: MutableList<Download>, notMetRequirements: Int): Notification =
        notifications.buildProgressNotification(this, android.R.drawable.stat_sys_download, null, null, downloads, notMetRequirements)

    private companion object {
        const val NOTIFICATION_ID = 7
        const val CHANNEL_ID = "downloads"
    }
}
