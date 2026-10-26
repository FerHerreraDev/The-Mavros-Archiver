#!/usr/bin/env bash
# Prueba de punta a punta en emulador contra el Supabase LOCAL.
#   android/scripts/e2e-emulator.sh [nombre del AVD]   (por defecto Phone_API_36: Android 16, como el S24 Ultra)
# Requiere: pnpm db:start en la raíz del repo.
#
# Se instala y ejecuta con adb directamente: la tarea connectedAndroidTest de AGP (UTP) falla al
# instalar en el emulador de Android 16 ("Invalid userId -2") y reporta 0 pruebas como éxito.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
AVD="${1:-Phone_API_36}"
SDK="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export JAVA_HOME="${JAVA_HOME:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}"
APP_ID="com.mavros.archiver.local"

# SOLO emuladores: la prueba borra datos de la app y siembra usuarios. Nunca se toca un
# teléfono real aunque esté conectado (todos los adb llevan -s con el serial del emulador).
# Solo emuladores de TELÉFONO: los de TV (android.software.leanback) son para scripts/e2e-tv.sh
emulator_serial() {
  adb devices | awk 'NR>1 && $1 ~ /^emulator-/ && $2=="device" {print $1}' | while read -r s; do
    adb -s "$s" shell pm list features 2>/dev/null | grep -q "android.software.leanback" || { echo "$s"; break; }
  done
}
SERIAL="$(emulator_serial)"
if [ -z "$SERIAL" ]; then
  echo "Arrancando emulador $AVD…"
  "$SDK/emulator/emulator" -avd "$AVD" -no-window -no-audio -no-boot-anim -no-snapshot-save >/tmp/mavros-emulator.log 2>&1 &
  STARTED_EMULATOR=1
  until SERIAL="$(emulator_serial)"; [ -n "$SERIAL" ]; do sleep 2; done
  until [ "$(adb -s "$SERIAL" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do sleep 2; done
fi
export ANDROID_SERIAL="$SERIAL"
case "$ANDROID_SERIAL" in emulator-*) ;; *) echo "✗ $ANDROID_SERIAL no es un emulador"; exit 1 ;; esac
echo "Usando $ANDROID_SERIAL"
# boot_completed llega antes de que el gestor de paquetes acepte instalaciones
until adb -s "$ANDROID_SERIAL" shell pm path android >/dev/null 2>&1; do sleep 2; done

echo "Compilando APKs…"
# BUILD=release prueba la versión optimizada (R8), firmada con la llave de prueba del flavor local
BUILD="${BUILD:-debug}"
VARIANT="$(tr '[:lower:]' '[:upper:]' <<< "${BUILD:0:1}")${BUILD:1}"
(cd "$ROOT/android" && ./gradlew :app-mobile:assembleLocal$VARIANT :app-mobile:assembleLocal${VARIANT}AndroidTest -Pmavros.testBuildType=$BUILD --console=plain -q)
adb install -r "$ROOT/android/app-mobile/build/outputs/apk/local/$BUILD/app-mobile-local-$BUILD.apk" >/dev/null
adb install -r -t "$ROOT/android/app-mobile/build/outputs/apk/androidTest/local/$BUILD/app-mobile-local-$BUILD-androidTest.apk" >/dev/null
# Empezar sin sesión guardada de corridas anteriores
adb shell pm clear "$APP_ID" >/dev/null

DATA=$(node "$ROOT/android/scripts/seed-e2e.mjs" seed)
cleanup() {
  node "$ROOT/android/scripts/seed-e2e.mjs" cleanup "$DATA" >/dev/null 2>&1 || true
  [ "${STARTED_EMULATOR:-0}" = "1" ] && adb emu kill >/dev/null 2>&1 || true
}
trap cleanup EXIT
arg() { python3 -c "import json,sys;print(json.loads(sys.argv[1])[sys.argv[2]])" "$DATA" "$1"; }

OUTPUT=$(adb shell am instrument -w -r -e class com.mavros.archiver.mobile.EmulatorSmokeTest \
  -e email "$(arg email)" -e password "$(arg password)" \
  -e movieTitle "'$(arg movieTitle)'" -e draftTitle "'$(arg draftTitle)'" \
  -e screenshots "${SCREENSHOTS:-false}" \
  "$APP_ID.test/androidx.test.runner.AndroidJUnitRunner")

# MOB-12: login en un proceso y "abrir en frío" con la sesión guardada en otro
adb shell pm clear "$APP_ID" >/dev/null
COLD_LOGIN=$(adb shell am instrument -w -r -e class "com.mavros.archiver.mobile.ColdStartTest#login" \
  -e email "$(arg email)" -e password "$(arg password)" "$APP_ID.test/androidx.test.runner.AndroidJUnitRunner")
COLD=$(adb shell am instrument -w -r -e class "com.mavros.archiver.mobile.ColdStartTest#coldStart" \
  -e movieId "$(arg movieId)" "$APP_ID.test/androidx.test.runner.AndroidJUnitRunner")
OUTPUT="$OUTPUT
$COLD_LOGIN
$COLD"

# Resultado: cada invocación debe terminar en "OK (N tests)"
if [ "$(echo "$OUTPUT" | grep -cE '^OK \([1-9][0-9]* tests?\)')" -eq 3 ]; then
  echo "$OUTPUT" | grep -E '^OK \(|MOB-12 secuencia'
  echo "✓ Pruebas en emulador superadas"
  if [ "${SCREENSHOTS:-false}" = "true" ]; then
    mkdir -p "$ROOT/android/build/screenshots"
    adb pull "/sdcard/Android/data/$APP_ID/files/screenshots/." "$ROOT/android/build/screenshots/" >/dev/null && echo "Capturas en android/build/screenshots"
  fi
else
  echo "$OUTPUT" | grep -vE '^INSTRUMENTATION_STATUS: (class|current|id|numtests|stream=$)' | head -60
  echo "✗ Prueba en emulador fallida"
  exit 1
fi
