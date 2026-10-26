import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

/**
 * Valores PÚBLICOS de producción (MOB-01): se leen solo NEXT_PUBLIC_SUPABASE_URL y
 * NEXT_PUBLIC_SUPABASE_ANON_KEY de ../.env.local (o de gradle properties en CI).
 * Ninguna otra línea del archivo se usa: los secretos nunca llegan al APK.
 */
val publicWebEnv: Map<String, String> = run {
    val allowed = setOf("NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY")
    val file = rootProject.projectDir.parentFile.resolve(".env.local")
    if (!file.exists()) return@run emptyMap()
    file.readLines()
        .mapNotNull { line -> line.split("=", limit = 2).takeIf { it.size == 2 && it[0].trim() in allowed } }
        .associate { (k, v) -> k.trim() to v.trim().trim('"') }
}
fun prodValue(name: String) = (findProperty("mavros.$name") as String?) ?: publicWebEnv[name] ?: ""

// Clave anónima del Supabase LOCAL: es la clave de demo fija del CLI, pública por diseño
val localAnonKey =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"

/**
 * Firma de PRODUCCIÓN (release): la llave es del dueño y vive FUERA del repositorio, en
 * ~/.mavros/keystore.properties (storeFile, storePassword, keyAlias, keyPassword). Nunca se sube.
 * Sin ese archivo, prodRelease no se puede compilar (ver la tarea de verificación abajo).
 */
val releaseKeys: Properties? = File(System.getProperty("user.home"), ".mavros/keystore.properties")
    .takeIf { it.exists() }
    ?.let { f -> Properties().apply { f.inputStream().use { load(it) } } }

android {
    namespace = "com.mavros.archiver.mobile"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.mavros.archiver"
        minSdk = 28
        targetSdk = 37
        versionCode = 2
        versionName = "1.0.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    // -Pmavros.testBuildType=release: las pruebas instrumentadas corren contra la versión optimizada (R8)
    testBuildType = (findProperty("mavros.testBuildType") as String?) ?: "debug"

    signingConfigs {
        releaseKeys?.let { keys ->
            create("release") {
                storeFile = file(keys.getProperty("storeFile"))
                storePassword = keys.getProperty("storePassword")
                keyAlias = keys.getProperty("keyAlias")
                keyPassword = keys.getProperty("keyPassword")
            }
        }
    }

    flavorDimensions += "env"
    productFlavors {
        // Emulador → Supabase local por 10.0.2.2 (único HTTP sin cifrar permitido, MOB-02)
        create("local") {
            dimension = "env"
            applicationIdSuffix = ".local"
            versionNameSuffix = "-local"
            // Solo emuladores: el release optimizado se firma con la llave de prueba para poder verificarlo
            signingConfig = signingConfigs.getByName("debug")
            buildConfigField("String", "SUPABASE_URL", "\"http://10.0.2.2:54321\"")
            buildConfigField("String", "SUPABASE_ANON_KEY", "\"$localAnonKey\"")
            buildConfigField("String", "SITE_URL", "\"http://10.0.2.2:3000\"")
        }
        create("prod") {
            dimension = "env"
            releaseKeys?.let { signingConfig = signingConfigs.getByName("release") }
            buildConfigField("String", "SUPABASE_URL", "\"${prodValue("NEXT_PUBLIC_SUPABASE_URL")}\"")
            buildConfigField("String", "SUPABASE_ANON_KEY", "\"${prodValue("NEXT_PUBLIC_SUPABASE_ANON_KEY")}\"")
            buildConfigField("String", "SITE_URL", "\"https://the-mavros-archiver.vercel.app\"")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (findProperty("mavros.testBuildType") == "release") proguardFiles("proguard-test-release.pro")
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }

    testOptions {
        unitTests.isIncludeAndroidResources = true
    }

    packaging {
        resources.excludes += setOf("/META-INF/{AL2.0,LGPL2.1}", "/META-INF/INDEX.LIST", "/META-INF/io.netty.versions.properties")
    }
}

dependencies {
    implementation(project(":core:model"))
    implementation(project(":core:data"))
    implementation(project(":core:design"))
    implementation(project(":core:android"))

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.core.splashscreen)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.material3)
    implementation(libs.compose.material.icons)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)
    implementation(libs.media3.exoplayer)
    implementation(libs.media3.exoplayer.hls)
    implementation(libs.media3.session)
    implementation(libs.media3.ui)
    implementation(libs.kotlinx.coroutines.guava)
    debugImplementation(libs.compose.ui.tooling)

    testImplementation(libs.junit)
    testImplementation(kotlin("test"))
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.robolectric)
    testImplementation(libs.coil.test)
    testImplementation(platform(libs.compose.bom))
    testImplementation(libs.compose.ui.test.junit4)
    debugImplementation(libs.compose.ui.test.manifest)

    androidTestImplementation(libs.androidx.test.ext.junit)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(platform(libs.compose.bom))
    androidTestImplementation(libs.compose.ui.test.junit4)
}

// prodRelease sin la llave del dueño saldría sin firmar (no instalable): mejor fallar con instrucciones
tasks.matching { it.name == "assembleProdRelease" || it.name == "packageProdRelease" }.configureEach {
    doFirst {
        check(releaseKeys != null) {
            "Falta ~/.mavros/keystore.properties con tu llave de firma. Créala con android/scripts/create-release-key.sh"
        }
    }
}