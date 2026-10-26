package com.mavros.archiver.tv.login

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.mavros.archiver.core.design.MavrosColors
import com.mavros.archiver.core.design.MavrosLoader

@Composable
fun TvLoginScreen(state: TvLoginState) {
    Box(Modifier.fillMaxSize().background(MavrosColors.Background).padding(64.dp)) {
        Text(
            buildAnnotatedString {
                append("THE MAVROS ")
                withStyle(SpanStyle(color = MavrosColors.Accent)) { append("ARCHIVER") }
            },
            style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold),
            color = MavrosColors.Foreground,
            modifier = Modifier.align(Alignment.TopStart),
        )
        when (state) {
            TvLoginState.Requesting, TvLoginState.SignedIn -> MavrosLoader(Modifier.align(Alignment.Center).testTag("tv-loading"), size = 72.dp)
            TvLoginState.Offline -> Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
                Text("Sin conexión. Revisa el internet de la tele.", color = MavrosColors.Foreground, style = MaterialTheme.typography.titleLarge)
                Spacer(Modifier.height(8.dp))
                Text("Reintentando…", color = MavrosColors.MutedForeground)
            }
            is TvLoginState.Showing -> CodePanel(state, Modifier.align(Alignment.Center))
        }
    }
}

@Composable
private fun CodePanel(state: TvLoginState.Showing, modifier: Modifier) {
    val qr = remember(state.code.verificationUriComplete) { qrBitmap(state.code.verificationUriComplete) }
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(64.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.width(520.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            state.notice?.let {
                Text(
                    when (it) {
                        CodeNotice.Expired -> "El código anterior caducó. Usa este nuevo."
                        CodeNotice.Denied -> "Se rechazó en el teléfono. Usa este código nuevo."
                        CodeNotice.Failed -> "No se pudo iniciar sesión. Intenta con este código nuevo."
                    },
                    color = MavrosColors.Accent,
                    modifier = Modifier.testTag("tv-notice"),
                )
            }
            Text("Conecta tu tele", style = MaterialTheme.typography.displaySmall.copy(fontWeight = FontWeight.Bold), color = MavrosColors.Foreground)
            Text("1. Escanea el código QR con tu teléfono", color = MavrosColors.Foreground, style = MaterialTheme.typography.titleMedium)
            Text(
                "2. O entra a ${state.code.verificationUri.substringAfter("://")} y escribe:",
                color = MavrosColors.Foreground,
                style = MaterialTheme.typography.titleMedium,
            )
            Text(
                state.code.userCode,
                fontFamily = FontFamily.Monospace,
                fontSize = 56.sp,
                letterSpacing = 6.sp,
                fontWeight = FontWeight.Bold,
                color = MavrosColors.Foreground,
                modifier = Modifier.testTag("tv-code"),
            )
            Text("3. Aprueba en el teléfono. La tele entra sola.", color = MavrosColors.MutedForeground)
            if (state.offline) Text("Sin conexión: reintentando…", color = MavrosColors.MutedForeground, modifier = Modifier.testTag("tv-offline"))
        }
        Box(Modifier.size(300.dp).clip(RoundedCornerShape(16.dp)).background(Color.White).padding(16.dp)) {
            Image(
                qr,
                contentDescription = null,
                filterQuality = FilterQuality.None, // módulos nítidos al escalar
                modifier = Modifier.fillMaxSize().testTag("tv-qr").semantics { contentDescription = "Código QR para conectar la tele" },
            )
        }
    }
}
