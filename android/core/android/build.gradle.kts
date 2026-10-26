plugins {
    alias(libs.plugins.android.library)
}

// Piezas Android compartidas por el teléfono y la tele: sesión guardada, contenedor de
// repositorios y el motor del reproductor (token del Worker + progreso). Sin UI.
android {
    namespace = "com.mavros.archiver.core.android"
    compileSdk = 37
    defaultConfig { minSdk = 28 }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }
}

dependencies {
    api(project(":core:model"))
    api(project(":core:data"))
    api(libs.media3.exoplayer)
    api(libs.media3.exoplayer.hls)
    implementation(libs.kotlinx.serialization.json)
    api(libs.androidx.lifecycle.viewmodel.compose)

    testImplementation(libs.junit)
    testImplementation(kotlin("test"))
    testImplementation(libs.kotlinx.coroutines.test)
}
