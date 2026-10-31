package com.mavros.archiver.mobile

import android.app.Application
import com.mavros.archiver.core.android.DefaultMavrosContainer
import com.mavros.archiver.core.android.MavrosContainer
import com.mavros.archiver.core.android.download.MavrosDownloads
import com.mavros.archiver.core.data.MavrosConfig
import com.mavros.archiver.core.data.SessionState
import com.mavros.archiver.mobile.download.MavrosDownloadService
import kotlinx.coroutines.launch

/** El teléfono usa el contenedor compartido (core:android) con su configuración */
typealias AppContainer = MavrosContainer

class MavrosApplication : Application() {
    lateinit var container: AppContainer
    /** Descargas para ver sin internet (DL-01..DL-07): solo el teléfono */
    val downloads by lazy { MavrosDownloads(this, container.playback, container.catalog, container.appScope, MavrosDownloadService::class.java) }

    override fun onCreate() {
        super.onCreate()
        container = DefaultMavrosContainer(
            this,
            MavrosConfig(supabaseUrl = BuildConfig.SUPABASE_URL, supabaseAnonKey = BuildConfig.SUPABASE_ANON_KEY, siteUrl = BuildConfig.SITE_URL),
        )
        // DL-06: sin sesión (cerrar sesión, sesión revocada) no queda nada descargado ni progreso guardado
        container.appScope.launch {
            container.auth.session.collect { state ->
                if (state == SessionState.SignedOut) {
                    if (downloads.items.value.isNotEmpty()) downloads.removeAll()
                    container.offlineProgress?.clear()
                }
            }
        }
    }
}
