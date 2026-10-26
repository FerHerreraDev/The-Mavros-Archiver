package com.mavros.archiver.mobile

import android.app.Application
import com.mavros.archiver.core.data.AuthRepository
import com.mavros.archiver.core.data.CatalogRepository
import com.mavros.archiver.core.data.MavrosConfig
import com.mavros.archiver.core.data.SupabaseAuthRepository
import com.mavros.archiver.core.data.SupabaseCatalogRepository
import com.mavros.archiver.core.data.createMavrosSupabase
import com.mavros.archiver.mobile.session.PrefsSessionManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

/** Dependencias de la app (sin framework de DI: son pocas y así se ven completas) */
interface AppContainer {
    val auth: AuthRepository
    val catalog: CatalogRepository

    /** Alcance de toda la app: el logout no se cancela aunque la pantalla desaparezca */
    val appScope: CoroutineScope
}

class DefaultAppContainer(app: Application) : AppContainer {
    override val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val config = MavrosConfig(
        supabaseUrl = BuildConfig.SUPABASE_URL,
        supabaseAnonKey = BuildConfig.SUPABASE_ANON_KEY,
        siteUrl = BuildConfig.SITE_URL,
    )
    private val supabase = createMavrosSupabase(config, PrefsSessionManager(app))

    override val auth: AuthRepository = SupabaseAuthRepository(supabase, appScope)
    override val catalog: CatalogRepository = SupabaseCatalogRepository(supabase, auth)
}

class MavrosApplication : Application() {
    lateinit var container: AppContainer

    override fun onCreate() {
        super.onCreate()
        container = DefaultAppContainer(this)
    }
}
