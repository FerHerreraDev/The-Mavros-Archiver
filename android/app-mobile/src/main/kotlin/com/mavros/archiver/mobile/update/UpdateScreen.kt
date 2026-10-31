package com.mavros.archiver.mobile.update

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.SystemUpdate
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
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
import com.mavros.archiver.core.android.update.AndroidApkInstaller
import com.mavros.archiver.core.android.update.UpdateTexts
import com.mavros.archiver.core.android.update.UpdateUiState
import com.mavros.archiver.core.android.update.UpdateViewModel
import com.mavros.archiver.core.design.MavrosColors
import com.mavros.archiver.mobile.AppContainer
import com.mavros.archiver.mobile.BuildConfig

/** Con una versión nueva publicada, la app no deja seguir hasta instalarla (UPD-04) */
@Composable
fun UpdateGate(container: AppContainer, content: @Composable () -> Unit) {
    val context = LocalContext.current
    val vm: UpdateViewModel = viewModel(
        key = "update",
        factory = viewModelFactory { initializer { UpdateViewModel(container.updates, AndroidApkInstaller(context), "mobile", BuildConfig.VERSION_CODE) } },
    )
    val state by vm.state.collectAsStateWithLifecycle()
    LifecycleResumeEffect(Unit) {
        vm.onResume()
        onPauseOrDispose { }
    }
    if (state == UpdateUiState.None) content() else UpdateScreen(state, onInstall = vm::install, onOpenSettings = vm::openSettings)
}

@Composable
fun UpdateScreen(state: UpdateUiState, onInstall: () -> Unit, onOpenSettings: () -> Unit) {
    val release = when (state) {
        UpdateUiState.None -> return
        is UpdateUiState.Required -> state.release
        is UpdateUiState.Downloading -> state.release
        is UpdateUiState.NeedsPermission -> state.release
        is UpdateUiState.Installing -> state.release
    }
    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).testTag("update"), contentAlignment = Alignment.Center) {
        Column(
            Modifier.widthIn(max = 420.dp).padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Icon(Icons.Outlined.SystemUpdate, contentDescription = null, tint = MavrosColors.Accent, modifier = Modifier.size(48.dp))
            Text(UpdateTexts.TITLE, style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold), textAlign = TextAlign.Center)
            Text(UpdateTexts.body(release.versionName), color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
            Spacer(Modifier.height(8.dp))
            when (state) {
                is UpdateUiState.Required -> {
                    state.problem?.let { Text(UpdateTexts.problem(it), color = MaterialTheme.colorScheme.error, textAlign = TextAlign.Center, modifier = Modifier.testTag("update-problem")) }
                    Button(onClick = onInstall, shape = RoundedCornerShape(999.dp), modifier = Modifier.fillMaxWidth().testTag("update-install")) {
                        Text(if (state.problem == null) UpdateTexts.INSTALL else UpdateTexts.RETRY)
                    }
                }
                is UpdateUiState.Downloading -> {
                    Text(UpdateTexts.downloading(state.progress), modifier = Modifier.testTag("update-progress"))
                    val progress = state.progress
                    if (progress != null) LinearProgressIndicator(progress = { progress }, modifier = Modifier.fillMaxWidth())
                    else LinearProgressIndicator(Modifier.fillMaxWidth())
                }
                is UpdateUiState.NeedsPermission -> {
                    Text(UpdateTexts.PERMISSION, textAlign = TextAlign.Center, modifier = Modifier.testTag("update-permission"))
                    Button(onClick = onOpenSettings, shape = RoundedCornerShape(999.dp), modifier = Modifier.fillMaxWidth().testTag("update-settings")) {
                        Text(UpdateTexts.OPEN_SETTINGS)
                    }
                }
                is UpdateUiState.Installing -> Text(UpdateTexts.INSTALLING)
                UpdateUiState.None -> Unit
            }
        }
    }
}
