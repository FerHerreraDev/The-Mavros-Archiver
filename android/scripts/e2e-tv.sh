#!/usr/bin/env bash
# Prueba de punta a punta de la app de la tele (TV-01, TV-02, TV-04, TV-05, TV-06) en un
# EMULADOR de Google TV contra el Supabase LOCAL y la web local. Nunca un dispositivo real.
#
#   1. Levanta la web (puerto 3002) y el Worker de video local (3101) apuntando a 10.0.2.2.
#   2. Crea un usuario y una película publicada con el HLS real de tests/fixtures/hls/sample.
#   3. Abre la app: lee el código de la pantalla, lo aprueba como lo haría el teléfono y espera
#      a que la tele entre sola al catálogo.
#   4. Con el control: OK → detalle → OK (Reproducir) → 7 s → Atrás, y exige progreso > 0 en la base.
#
# Requisitos: `pnpm db:start`, el build de E2E de la web (.next-e2e, lo genera `pnpm test:e2e`) y un
# emulador de Google TV encendido (AVD Google_TV_API_34).
set -euo pipefail
export JAVA_HOME="${JAVA_HOME:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
PORT=3002
# BUILD=release prueba la versión optimizada (R8) firmada con la llave de prueba del flavor local
BUILD="${BUILD:-debug}"
VARIANT="$(tr '[:lower:]' '[:upper:]' <<< "${BUILD:0:1}")${BUILD:1}"
PKG=com.mavros.archiver.tv.local
OUT="$(mktemp -d)"

SERIAL=$("$ADB" devices | awk '$2=="device" && $1 ~ /^emulator-/ {print $1}' | while read s; do
  "$ADB" -s "$s" shell pm list features | grep -q "android.software.leanback" && echo "$s"; done | head -1)
[ -n "$SERIAL" ] || { echo "✗ No hay un emulador de TV encendido (solo se prueba en emuladores)"; exit 1; }
export ANDROID_SERIAL="$SERIAL"
echo "Usando $SERIAL"

eval "$(node android/scripts/e2e-tv-seed.mjs env "$PORT")"

node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/helpers/video-cdn-server.ts tests/fixtures/hls 3101 >"$OUT/cdn.log" 2>&1 & CDN=$!; disown
node_modules/.bin/next start -p $PORT >"$OUT/web.log" 2>&1 & WEB=$!; disown
cleanup() { kill $CDN $WEB 2>/dev/null || true; node android/scripts/e2e-tv-seed.mjs cleanup "$OUT/seed.json" >/dev/null 2>&1 || true; }
trap cleanup EXIT
for i in $(seq 1 40); do curl -sf -o /dev/null "http://localhost:$PORT/login" && break; sleep 0.5; done

node android/scripts/e2e-tv-seed.mjs seed "$OUT/seed.json"

echo "Compilando e instalando…"
(cd android && ./gradlew :app-tv:assembleLocal$VARIANT -Pmavros.localSiteUrl=http://10.0.2.2:$PORT -q)
"$ADB" uninstall $PKG >/dev/null 2>&1 || true # debug y release tienen distinta firma
"$ADB" install android/app-tv/build/outputs/apk/local/$BUILD/app-tv-local-$BUILD.apk >/dev/null
"$ADB" shell pm clear $PKG >/dev/null # empieza sin sesión
"$ADB" shell am start -n $PKG/com.mavros.archiver.tv.TvActivity >/dev/null

ui() { "$ADB" shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; "$ADB" pull /sdcard/ui.xml "$OUT/ui.xml" >/dev/null 2>&1; cat "$OUT/ui.xml"; }
wait_text() { for i in $(seq 1 30); do ui | grep -qE "$1" && return 0; sleep 1; done; echo "✗ No apareció: $1"; exit 1; }

wait_text 'text="[A-Z0-9]{4}-[A-Z0-9]{4}"'
CODE=$(grep -oE 'text="[A-Z0-9]{4}-[A-Z0-9]{4}"' "$OUT/ui.xml" | head -1 | cut -d'"' -f2)
echo "✓ TV-01 la tele muestra el código $CODE"
node android/scripts/e2e-tv-seed.mjs approve "$OUT/seed.json" "$CODE"
wait_text 'Recién agregadas'
echo "✓ TV-02 aprobado en el 'teléfono': la tele entró sola al catálogo"

"$ADB" shell input keyevent KEYCODE_DPAD_CENTER
wait_text 'text="Reproducir"'
echo "✓ TV-05 OK abre el detalle con Reproducir"
"$ADB" shell input keyevent KEYCODE_DPAD_CENTER
# El video de prueba dura 12 s: todo lo que mira si sigue reproduciendo pasa antes de que termine
sleep 4
"$ADB" shell dumpsys activity activities | grep -q "topResumedActivity=.*TvPlayerActivity" || { echo "✗ No abrió el reproductor"; exit 1; }

# TV-06: OK muestra los controles (sin pausar); → → llega a Calidad; OK abre la lista
"$ADB" shell input keyevent KEYCODE_DPAD_CENTER; sleep 1
ui | grep -q 'content-desc="Pausar"' || { echo "✗ TV-06 OK no mostró los controles (o pausó). En pantalla: $(grep -oE 'content-desc="[^"]+"|text="[^"]+"' "$OUT/ui.xml" | tr '\n' ' ')"; exit 1; }
# ← enfoca ⏪ y OK lo activa: vuelve al inicio (el video de prueba es corto) y prueba ese botón
"$ADB" shell input keyevent KEYCODE_DPAD_LEFT; "$ADB" shell input keyevent KEYCODE_DPAD_CENTER
# ⏪ → ⏯ → ⏩ → Calidad
"$ADB" shell input keyevent KEYCODE_DPAD_RIGHT; "$ADB" shell input keyevent KEYCODE_DPAD_RIGHT; "$ADB" shell input keyevent KEYCODE_DPAD_RIGHT
"$ADB" shell input keyevent KEYCODE_DPAD_CENTER; sleep 1
wait_text 'text="Automática"'
"$ADB" shell input keyevent KEYCODE_BACK; sleep 1   # cierra la lista
# La lista es otra ventana: al cerrarla, el botón debe seguir diciendo "Pausar" (nada pausó el video)
ui | grep -q 'content-desc="Pausar"' || { echo "✗ TV-06 abrir Calidad pausó el video. En pantalla: $(grep -oE 'content-desc="[^"]+"|text="[^"]+"' "$OUT/ui.xml" | tr '\n' ' ')"; exit 1; }
echo "✓ TV-06 OK muestra los controles y Calidad abre la lista sin pausar"
"$ADB" shell input keyevent KEYCODE_BACK; sleep 1   # oculta los controles
"$ADB" shell dumpsys activity activities | grep -q "topResumedActivity=.*TvPlayerActivity" || { echo "✗ TV-06 Atrás salió en vez de ocultar"; exit 1; }
"$ADB" shell input keyevent KEYCODE_BACK            # ahora sí sale
sleep 3
POS=$(node android/scripts/e2e-tv-seed.mjs progress "$OUT/seed.json")
awk -v p="$POS" 'BEGIN { exit !(p > 0) }' || { echo "✗ TV-06 no se guardó progreso ($POS)"; exit 1; }
echo "✓ TV-06 reprodujo el HLS real y al salir guardó el progreso: ${POS}s"
echo "✓ Prueba de la tele superada ($BUILD)"
