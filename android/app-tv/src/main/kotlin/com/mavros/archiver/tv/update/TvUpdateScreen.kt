package com.mavros.archiver.tv.update

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import androidx.tv.material3.Button
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.mavros.archiver.core.android.MavrosContainer
import com.mavros.archiver.core.android.update.AndroidApkInstaller
import com.mavros.archiver.core.android.update.UpdateTexts
import com.mavros.archiver.core.android.update.UpdateUiState
import com.mavros.archiver.core.android.update.UpdateViewModel
import com.mavros.archiver.core.design.MavrosColors
import com.mavros.archiver.tv.BuildConfig

/** Con una versión nueva publicada, la tele no deja seguir hasta instalarla (UPD-04) */
@Composable
fun TvUpdateGate(container: MavrosContainer, content: @Composable () -> Unit) {
    val context = LocalContext.current
    val vm: UpdateViewModel = viewModel(
        key = "update",
        factory = viewModelFactory { initializer { UpdateViewModel(container.updates, AndroidApkInstaller(context), "tv", BuildConfig.VERSION_CODE) } },
    )
    val state by vm.state.collectAsStateWithLifecycle()
    LifecycleResumeEffect(Unit) {
        vm.onResume()
        onPauseOrDispose { }
    }
    if (state == UpdateUiState.None) content() else TvUpdateScreen(state, onInstall = vm::install, onOpenSettings = vm::openSettings)
}

@Composable
fun TvUpdateScreen(state: UpdateUiState, onInstall: () -> Unit, onOpenSettings: () -> Unit) {
    val release = when (state) {
        UpdateUiState.None -> return
        is UpdateUiState.Required -> state.release
        is UpdateUiState.Downloading -> state.release
        is UpdateUiState.NeedsPermission -> state.release
        is UpdateUiState.Installing -> state.release
    }
    val action = remember { FocusRequester() }
    // El botón queda enfocado para el control remoto
    LaunchedEffect(state::class) { runCatching { action.requestFocus() } }
    Box(Modifier.fillMaxSize().background(MavrosColors.Background).testTag("tv-update"), contentAlignment = Alignment.Center) {
        Column(Modifier.widthIn(max = 640.dp).padding(48.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(20.dp)) {
            Text(UpdateTexts.TITLE, style = MaterialTheme.typography.displaySmall.copy(fontWeight = FontWeight.Bold), color = MavrosColors.Foreground, textAlign = TextAlign.Center)
            Text(UpdateTexts.body(release.versionName), style = MaterialTheme.typography.titleMedium, color = MavrosColors.MutedForeground, textAlign = TextAlign.Center)
            when (state) {
                is UpdateUiState.Required -> {
                    state.problem?.let { Text(UpdateTexts.problem(it), color = MavrosColors.Accent, modifier = Modifier.testTag("tv-update-problem")) }
                    Button(onClick = onInstall, modifier = Modifier.focusRequester(action).testTag("tv-update-install")) {
                        Text(if (state.problem == null) UpdateTexts.INSTALL else UpdateTexts.RETRY)
                    }
                }
                is UpdateUiState.Downloading -> {
                    Text(UpdateTexts.downloading(state.progress), color = MavrosColors.Foreground, modifier = Modifier.testTag("tv-update-progress"))
                    Box(Modifier.width(420.dp).height(6.dp).background(MavrosColors.Card)) {
                        Box(Modifier.fillMaxWidth(state.progress ?: 0f).height(6.dp).background(MavrosColors.Accent))
                    }
                }
                is UpdateUiState.NeedsPermission -> {
                    Text(UpdateTexts.PERMISSION, color = MavrosColors.Foreground, textAlign = TextAlign.Center, modifier = Modifier.testTag("tv-update-permission"))
                    Button(onClick = onOpenSettings, modifier = Modifier.focusRequester(action).testTag("tv-update-settings")) { Text(UpdateTexts.OPEN_SETTINGS) }
                }
                is UpdateUiState.Installing -> Text(UpdateTexts.INSTALLING, color = MavrosColors.Foreground)
                UpdateUiState.None -> Unit
            }
        }
    }
}
