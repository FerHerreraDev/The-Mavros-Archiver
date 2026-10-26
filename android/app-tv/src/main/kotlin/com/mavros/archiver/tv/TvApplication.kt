package com.mavros.archiver.tv

import android.app.Application
import com.mavros.archiver.core.android.DefaultMavrosContainer
import com.mavros.archiver.core.android.MavrosContainer
import com.mavros.archiver.core.data.MavrosConfig

class TvApplication : Application() {
    lateinit var container: MavrosContainer

    override fun onCreate() {
        super.onCreate()
        container = DefaultMavrosContainer(
            this,
            MavrosConfig(supabaseUrl = BuildConfig.SUPABASE_URL, supabaseAnonKey = BuildConfig.SUPABASE_ANON_KEY, siteUrl = BuildConfig.SITE_URL),
        )
    }
}
