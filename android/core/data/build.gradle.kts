plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.serialization)
}

kotlin {
    compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_21) }
}

java {
    sourceCompatibility = JavaVersion.VERSION_21
    targetCompatibility = JavaVersion.VERSION_21
}

dependencies {
    api(project(":core:model"))
    api(platform(libs.supabase.bom))
    api(libs.supabase.auth)
    api(libs.supabase.postgrest)
    api(libs.ktor.client.okhttp)
    implementation(libs.kotlinx.serialization.json)
    api(libs.kotlinx.coroutines.core)

    testImplementation(libs.junit)
    testImplementation(kotlin("test"))
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.turbine)
    testImplementation(libs.ktor.client.mock)
}

// Pruebas rápidas: todo menos el paquete integration
tasks.test {
    exclude("**/integration/**")
}

// Pruebas contra el Supabase LOCAL (pnpm db:start). Nunca producción: la URL debe ser 127.0.0.1.
val supabaseStatus = providers.exec {
    workingDir = rootProject.projectDir.parentFile
    commandLine("node_modules/.bin/supabase", "status", "-o", "json")
    isIgnoreExitValue = true
}.standardOutput.asText

val integrationTest by tasks.registering(Test::class) {
    description = "Pruebas de core:data contra Supabase local"
    group = "verification"
    testClassesDirs = sourceSets["test"].output.classesDirs
    classpath = sourceSets["test"].runtimeClasspath
    include("**/integration/**")
    // Variable local: las lambdas no deben capturar el script (caché de configuración de Gradle)
    val status = supabaseStatus
    jvmArgumentProviders.add(CommandLineArgumentProvider { listOf("-Dmavros.supabaseStatus=${status.get()}") })
    doNotTrackState("Siempre corre contra el estado actual del Supabase local")
}
