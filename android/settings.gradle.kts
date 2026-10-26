pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "mavros-archiver"

include(":core:model")
include(":core:data")
include(":core:design")
include(":core:android")
include(":app-mobile")
include(":app-tv")
