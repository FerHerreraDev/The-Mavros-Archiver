package com.mavros.archiver.mobile

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import com.mavros.archiver.mobile.player.PlayerActivity
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.foundation.background
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import com.mavros.archiver.core.data.SessionState
import com.mavros.archiver.mobile.catalog.CatalogScreen
import com.mavros.archiver.core.android.catalog.CatalogViewModel
import com.mavros.archiver.mobile.detail.DetailScreen
import com.mavros.archiver.core.android.detail.DetailViewModel
import com.mavros.archiver.mobile.login.LoginScreen
import com.mavros.archiver.mobile.login.LoginViewModel
import com.mavros.archiver.mobile.profile.ProfileScreen
import com.mavros.archiver.mobile.series.SeriesScreen
import com.mavros.archiver.core.android.series.SeriesViewModel
import kotlinx.coroutines.launch
import androidx.lifecycle.compose.LifecycleResumeEffect
import com.mavros.archiver.core.android.lists.AddToListViewModel
import com.mavros.archiver.core.android.lists.ListsViewModel
import com.mavros.archiver.core.android.lists.PlaylistViewModel
import com.mavros.archiver.core.model.PlaylistTarget
import com.mavros.archiver.mobile.lists.AddToListButton
import com.mavros.archiver.mobile.lists.ListsContent
import com.mavros.archiver.mobile.lists.PlaylistContent
import kotlinx.serialization.Serializable

@Serializable data object CatalogRoute
@Serializable data class DetailRoute(val movieId: String)
@Serializable data object ProfileRoute
@Serializable data class SeriesRoute(val seriesId: String)
@Serializable data object ListsRoute
@Serializable data class PlaylistRoute(val playlistId: String)

/**
 * Sin sesión solo existe el login; con sesión, catálogo/detalle/perfil.
 * Si la sesión se pierde (logout, revocada, MOB-06) la app vuelve sola al login.
 */
@Composable
fun MavrosNavHost(container: AppContainer) {
    val session by container.auth.session.collectAsStateWithLifecycle()

    when (val state = session) {
        SessionState.Loading -> Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background))
        SessionState.SignedOut -> {
            val vm: LoginViewModel = viewModel(factory = viewModelFactory { initializer { LoginViewModel(container.auth) } })
            LoginScreen(vm)
        }
        is SessionState.SignedIn -> SignedInGraph(container, state)
    }
}

@Composable
private fun SignedInGraph(container: AppContainer, session: SessionState.SignedIn) {
    val nav = rememberNavController()
    NavHost(nav, startDestination = CatalogRoute) {
        composable<CatalogRoute> {
            val vm: CatalogViewModel = viewModel(factory = viewModelFactory { initializer { CatalogViewModel(container.catalog, container.progress) } })
            CatalogScreen(
                viewModel = vm,
                onOpenMovie = { nav.navigate(DetailRoute(it)) },
                onOpenProfile = { nav.navigate(ProfileRoute) },
                onOpenSeries = { nav.navigate(SeriesRoute(it)) },
                onOpenLists = { nav.navigate(ListsRoute) },
            )
        }
        composable<ListsRoute> {
            val vm: ListsViewModel = viewModel(factory = viewModelFactory { initializer { ListsViewModel(container.playlists) } })
            val state by vm.state.collectAsStateWithLifecycle()
            LifecycleResumeEffect(Unit) {
                vm.refresh()
                onPauseOrDispose { }
            }
            ListsContent(state, onBack = { nav.popBackStack() }, onOpen = { nav.navigate(PlaylistRoute(it)) }, onRetry = vm::retry)
        }
        composable<PlaylistRoute> { entry ->
            val context = LocalContext.current
            val playlistId = entry.toRoute<PlaylistRoute>().playlistId
            val vm: PlaylistViewModel = viewModel(key = playlistId, factory = viewModelFactory { initializer { PlaylistViewModel(container.playlists, playlistId, container.progress) } })
            val state by vm.state.collectAsStateWithLifecycle()
            PlaylistContent(
                state,
                onBack = { nav.popBackStack() },
                onPlay = { detail -> detail.start?.let { context.startActivity(PlayerActivity.intent(context, it.episode, it.startAt, detail.playlist.id)) } },
                onOpenItem = { item -> item.movie?.let { nav.navigate(DetailRoute(it.id)) } ?: item.series?.let { nav.navigate(SeriesRoute(it.id)) } },
                onRetry = vm::retry,
            )
        }
        composable<SeriesRoute> { entry ->
            val context = LocalContext.current
            val seriesId = entry.toRoute<SeriesRoute>().seriesId
            val vm: SeriesViewModel = viewModel(key = seriesId, factory = viewModelFactory { initializer { SeriesViewModel(container.catalog, seriesId, container.progress) } })
            SeriesScreen(
                viewModel = vm,
                onBack = { nav.popBackStack() },
                onPlay = { movie, start -> context.startActivity(PlayerActivity.intent(context, movie, start)) },
                extra = { AddToList(container, PlaylistTarget.SeriesTarget(seriesId)) },
            )
        }
        composable<DetailRoute> { entry ->
            val context = LocalContext.current
            val movieId = entry.toRoute<DetailRoute>().movieId
            val vm: DetailViewModel = viewModel(key = movieId, factory = viewModelFactory { initializer { DetailViewModel(container.catalog, movieId, container.progress) } })
            DetailScreen(
                viewModel = vm,
                onBack = { nav.popBackStack() },
                onPlay = { movie, start -> context.startActivity(PlayerActivity.intent(context, movie, start)) },
                extra = { AddToList(container, PlaylistTarget.MovieTarget(movieId)) },
                onOpenSeries = { nav.navigate(SeriesRoute(it)) },
            )
        }
        composable<ProfileRoute> {
            ProfileScreen(
                email = session.email,
                onBack = { nav.popBackStack() },
                onSignOut = { container.appScope.launch { container.auth.signOut() } },
            )
        }
    }
}

/** "Agregar a lista" con su ViewModel (uno por película/serie) */
@Composable
private fun AddToList(container: AppContainer, target: PlaylistTarget) {
    val vm: AddToListViewModel = viewModel(key = "add-$target", factory = viewModelFactory { initializer { AddToListViewModel(container.playlists, target) } })
    val state by vm.state.collectAsStateWithLifecycle()
    AddToListButton(state, onOpen = vm::load, onToggle = vm::toggle, onCreate = vm::create)
}
