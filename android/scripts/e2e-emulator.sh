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

if ! adb get-state >/dev/null 2>&1; then
  echo "Arrancando emulador $AVD…"
  "$SDK/emulator/emulator" -avd "$AVD" -no-window -no-audio -no-boot-anim -no-snapshot-save >/tmp/mavros-emulator.log 2>&1 &
  STARTED_EMULATOR=1
  adb wait-for-device
  until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do sleep 2; done
fi
# boot_completed llega antes de que el gestor de paquetes acepte instalaciones
until adb shell pm path android >/dev/null 2>&1; do sleep 2; done

echo "Compilando APKs…"
(cd "$ROOT/android" && ./gradlew :app-mobile:assembleLocalDebug :app-mobile:assembleLocalDebugAndroidTest --console=plain -q)
adb install -r "$ROOT/android/app-mobile/build/outputs/apk/local/debug/app-mobile-local-debug.apk" >/dev/null
adb install -r -t "$ROOT/android/app-mobile/build/outputs/apk/androidTest/local/debug/app-mobile-local-debug-androidTest.apk" >/dev/null
# Empezar sin sesión guardada de corridas anteriores
adb shell pm clear "$APP_ID" >/dev/null

DATA=$(node "$ROOT/android/scripts/seed-e2e.mjs" seed)
cleanup() {
  node "$ROOT/android/scripts/seed-e2e.mjs" cleanup "$DATA" >/dev/null 2>&1 || true
  [ "${STARTED_EMULATOR:-0}" = "1" ] && adb emu kill >/dev/null 2>&1 || true
}
trap cleanup EXIT
arg() { python3 -c "import json,sys;print(json.loads(sys.argv[1])[sys.argv[2]])" "$DATA" "$1"; }

OUTPUT=$(adb shell am instrument -w -r \
  -e email "$(arg email)" -e password "$(arg password)" \
  -e movieTitle "'$(arg movieTitle)'" -e draftTitle "'$(arg draftTitle)'" \
  -e screenshots "${SCREENSHOTS:-false}" \
  "$APP_ID.test/androidx.test.runner.AndroidJUnitRunner")

# Resultado: "OK (N tests)" o "FAILURES!!!" con el detalle
if echo "$OUTPUT" | grep -qE '^OK \([1-9][0-9]* tests?\)'; then
  echo "$OUTPUT" | grep -E '^OK \('
  echo "✓ Prueba en emulador superada"
  if [ "${SCREENSHOTS:-false}" = "true" ]; then
    mkdir -p "$ROOT/android/build/screenshots"
    adb pull "/sdcard/Android/data/$APP_ID/files/screenshots/." "$ROOT/android/build/screenshots/" >/dev/null && echo "Capturas en android/build/screenshots"
  fi
else
  echo "$OUTPUT" | grep -vE '^INSTRUMENTATION_STATUS: (class|current|id|numtests|stream=$)' | head -60
  echo "✗ Prueba en emulador fallida"
  exit 1
fi
