package com.mavros.archiver.core.android

import android.app.Application
import com.mavros.archiver.core.android.download.OfflineAwareProgressRepository
import com.mavros.archiver.core.android.download.PrefsLocalProgress
import com.mavros.archiver.core.android.session.PrefsSessionManager
import com.mavros.archiver.core.data.AppUpdateRepository
import com.mavros.archiver.core.data.AuthRepository
import com.mavros.archiver.core.data.HttpAppUpdateRepository
import com.mavros.archiver.core.data.CatalogRepository
import com.mavros.archiver.core.data.DeviceAuthRepository
import com.mavros.archiver.core.data.HttpDeviceAuthRepository
import com.mavros.archiver.core.data.HttpPlaybackRepository
import com.mavros.archiver.core.data.MavrosConfig
import com.mavros.archiver.core.data.PlaybackRepository
import com.mavros.archiver.core.data.PlaylistRepository
import com.mavros.archiver.core.data.RequestRepository
import com.mavros.archiver.core.data.SupabaseRequestRepository
import com.mavros.archiver.core.data.SupabasePlaylistRepository
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
    val playlists: PlaylistRepository
    val updates: AppUpdateRepository
    val requests: RequestRepository

    /** Progreso con respaldo en el aparato para lo visto sin internet (DL-05); null en las pruebas */
    val offlineProgress: OfflineAwareProgressRepository? get() = null

    /** Alcance de toda la app: logout y guardados no se cancelan aunque la pantalla desaparezca */
    val appScope: CoroutineScope
}

class DefaultMavrosContainer(app: Application, config: MavrosConfig) : MavrosContainer {
    override val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val supabase = createMavrosSupabase(config, PrefsSessionManager(app))

    override val auth: AuthRepository = SupabaseAuthRepository(supabase, appScope)
    override val catalog: CatalogRepository = SupabaseCatalogRepository(supabase, auth)
    override val playback: PlaybackRepository = HttpPlaybackRepository(config, supabase, auth)
    private val serverProgress = SupabaseProgressRepository(supabase)
    override val offlineProgress = OfflineAwareProgressRepository(serverProgress, PrefsLocalProgress(app), serverProgress::updatedAt)
    override val progress: ProgressRepository = offlineProgress
    override val device: DeviceAuthRepository = HttpDeviceAuthRepository(config)
    override val playlists: PlaylistRepository = SupabasePlaylistRepository(supabase, auth)
    override val updates: AppUpdateRepository = HttpAppUpdateRepository(config, supabase)
    override val requests: RequestRepository = SupabaseRequestRepository(supabase, auth)
}
