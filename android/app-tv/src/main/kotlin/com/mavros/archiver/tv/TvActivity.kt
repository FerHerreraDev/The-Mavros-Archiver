package com.mavros.archiver.tv

import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.darkColorScheme
import com.mavros.archiver.core.android.MavrosContainer
import com.mavros.archiver.core.android.catalog.CatalogViewModel
import com.mavros.archiver.core.android.detail.DetailViewModel
import com.mavros.archiver.core.data.SessionState
import com.mavros.archiver.core.design.MavrosColors
import com.mavros.archiver.core.design.MavrosLoader
import com.mavros.archiver.tv.catalog.TvCatalogScreen
import com.mavros.archiver.tv.detail.TvDetailScreen
import com.mavros.archiver.tv.login.TvLoginScreen
import com.mavros.archiver.tv.login.TvLoginViewModel
import com.mavros.archiver.tv.player.TvPlayerActivity
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable

@Serializable private data object CatalogRoute
@Serializable private data class DetailRoute(val movieId: String)

class TvActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val container = (application as TvApplication).container
        // Igual que el teléfono: al abrir se confirma con el servidor que la sesión sigue valiendo (MOB-06)
        lifecycleScope.launch { container.auth.validateSession() }
        setContent { MavrosTvTheme { TvRoot(container) } }
    }
}

@Composable
fun MavrosTvTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = MavrosColors.Primary,
            onPrimary = MavrosColors.Background,
            secondary = MavrosColors.Accent,
            background = MavrosColors.Background,
            surface = MavrosColors.Card,
            onSurface = MavrosColors.Foreground,
            border = MavrosColors.Accent,
        ),
        content = content,
    )
}

@Composable
fun TvRoot(container: MavrosContainer) {
    val session by container.auth.session.collectAsStateWithLifecycle()
    when (val s = session) {
        SessionState.Loading -> Box(Modifier.fillMaxSize().background(MavrosColors.Background)) {
            MavrosLoader(Modifier.align(Alignment.Center), size = 72.dp)
        }
        SessionState.SignedOut -> {
            // Un ViewModel nuevo cada vez que se cierra sesión: código nuevo
            val vm: TvLoginViewModel = viewModel(key = "login", factory = viewModelFactory {
                initializer { TvLoginViewModel(container.device, container.auth, "${Build.MANUFACTURER} ${Build.MODEL}".trim()) }
            })
            val state by vm.state.collectAsStateWithLifecycle()
            TvLoginScreen(state)
        }
        is SessionState.SignedIn -> SignedIn(container, s.userId)
    }
}

@Composable
private fun SignedIn(container: MavrosContainer, userId: String) {
    val nav = rememberNavController()
    val context = LocalContext.current
    NavHost(nav, startDestination = CatalogRoute) {
        composable<CatalogRoute> {
            val vm: CatalogViewModel = viewModel(key = "catalog-$userId", factory = viewModelFactory { initializer { CatalogViewModel(container.catalog, container.progress) } })
            val state by vm.state.collectAsStateWithLifecycle()
            LifecycleResumeEffect(Unit) {
                vm.refresh()
                onPauseOrDispose { }
            }
            TvCatalogScreen(
                state = state,
                onOpenMovie = { nav.navigate(DetailRoute(it)) },
                onSignOut = { container.appScope.launch { container.auth.signOut() } },
                onRetry = vm::retry,
            )
        }
        composable<DetailRoute> { entry ->
            val movieId = entry.toRoute<DetailRoute>().movieId
            val vm: DetailViewModel = viewModel(key = movieId, factory = viewModelFactory { initializer { DetailViewModel(container.catalog, movieId, container.progress) } })
            val state by vm.state.collectAsStateWithLifecycle()
            TvDetailScreen(state, onPlay = { movie, start -> context.startActivity(TvPlayerActivity.intent(context, movie, start)) }, onRetry = vm::retry)
        }
    }
}
