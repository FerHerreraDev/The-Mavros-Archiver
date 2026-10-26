package com.mavros.archiver.mobile

import android.app.Application
import com.mavros.archiver.core.android.DefaultMavrosContainer
import com.mavros.archiver.core.android.MavrosContainer
import com.mavros.archiver.core.data.MavrosConfig

/** El teléfono usa el contenedor compartido (core:android) con su configuración */
typealias AppContainer = MavrosContainer

class MavrosApplication : Application() {
    lateinit var container: AppContainer

    override fun onCreate() {
        super.onCreate()
        container = DefaultMavrosContainer(
            this,
            MavrosConfig(supabaseUrl = BuildConfig.SUPABASE_URL, supabaseAnonKey = BuildConfig.SUPABASE_ANON_KEY, siteUrl = BuildConfig.SITE_URL),
        )
    }
}
