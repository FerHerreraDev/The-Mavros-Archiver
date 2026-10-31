package com.mavros.archiver.core.model

/** Versión publicada de una app Android (UPD-03) */
data class AppRelease(
    val versionCode: Int,
    val versionName: String,
    val sha256: String,
    val url: String,
)

object UpdateRules {
    /** UPD-06: solo una versión mayor que la instalada obliga a actualizar; sin datos, nunca */
    fun needsUpdate(installedVersionCode: Int, latest: AppRelease?): Boolean =
        latest != null && latest.versionCode > installedVersionCode
}
