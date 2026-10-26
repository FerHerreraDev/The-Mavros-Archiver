# SOLO al probar la versión optimizada (-Pmavros.testBuildType=release). El APK de pruebas trae el
# test runner, que usa Kotlin y androidx.test desde el APK de la app; R8 los recortaría y
# renombraría ahí porque la app no los usa igual. La versión que se instala de verdad no lleva
# estas reglas. La optimización completa (recorte + renombrado) del código compartido se prueba
# con la versión release de la tele (scripts/e2e-tv.sh con BUILD=release), sin test runner dentro.
-dontobfuscate
# El test runner y Compose Test comparten casi todo androidx y Kotlin con la app: se conservan
# enteros. Lo que importa sigue optimizado y probado: el código de la app (com.mavros.**) y
# supabase-kt, Ktor y kotlinx.serialization (donde falla la lectura de datos si falta una regla).
-keep class androidx.** { *; }
-keep class kotlin.** { *; }
-keep class kotlinx.coroutines.** { *; }
-dontwarn androidx.test.**
