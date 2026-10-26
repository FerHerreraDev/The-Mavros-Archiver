package com.mavros.archiver.core.android

import android.app.Application
import com.mavros.archiver.core.android.session.PrefsSessionManager
import com.mavros.archiver.core.data.AuthRepository
import com.mavros.archiver.core.data.CatalogRepository
import com.mavros.archiver.core.data.DeviceAuthRepository
import com.mavros.archiver.core.data.HttpDeviceAuthRepository
import com.mavros.archiver.core.data.HttpPlaybackRepository
import com.mavros.archiver.core.data.MavrosConfig
import com.mavros.archiver.core.data.PlaybackRepository
import com.mavros.archiver.core.data.ProgressRepository
import com.mavros.archiver.core.data.SupabaseAuthRepository
import com.mavros.archiver.core.data.SupabaseCatalogRepository
import com.mavros.archiver.core.data.SupabaseProgressRepository
import com.mavros.archiver.core.data.createMavrosSupabase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

/** Repositorios de la app (teléfono o tele). Las pantallas reciben esto, nunca el cliente de Supabase. */
interface MavrosContainer {
    val auth: AuthRepository
    val catalog: CatalogRepository
    val playback: PlaybackRepository
    val progress: ProgressRepository
    val device: DeviceAuthRepository

    /** Alcance de toda la app: logout y guardados no se cancelan aunque la pantalla desaparezca */
    val appScope: CoroutineScope
}

class DefaultMavrosContainer(app: Application, config: MavrosConfig) : MavrosContainer {
    override val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val supabase = createMavrosSupabase(config, PrefsSessionManager(app))

    override val auth: AuthRepository = SupabaseAuthRepository(supabase, appScope)
    override val catalog: CatalogRepository = SupabaseCatalogRepository(supabase, auth)
    override val playback: PlaybackRepository = HttpPlaybackRepository(config, supabase, auth)
    override val progress: ProgressRepository = SupabaseProgressRepository(supabase)
    override val device: DeviceAuthRepository = HttpDeviceAuthRepository(config)
}
