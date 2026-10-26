package com.mavros.archiver.mobile

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.lifecycleScope
import com.mavros.archiver.core.data.SessionState
import com.mavros.archiver.core.design.MavrosTheme
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    private val container get() = (application as MavrosApplication).container

    override fun onCreate(savedInstanceState: Bundle?) {
        // El splash se queda mientras se sabe si hay sesión guardada (MOB-04)
        installSplashScreen().setKeepOnScreenCondition { container.auth.session.value is SessionState.Loading }
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContent {
            MavrosTheme {
                MavrosNavHost(container)
            }
        }
    }

    override fun onStart() {
        super.onStart()
        // Al volver a la app se confirma con el servidor que la sesión sigue valiendo (MOB-06)
        lifecycleScope.launch { container.auth.validateSession() }
    }
}
