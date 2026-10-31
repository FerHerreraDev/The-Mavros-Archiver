#!/usr/bin/env bash
# Prueba de punta a punta de las descargas del teléfono (DL-01, DL-03, DL-04) en un EMULADOR contra
# el Supabase LOCAL, la web local y el Worker de video local. Nunca un teléfono real.
#
#   1. Película con el HLS real de tests/fixtures/hls/tracks (12 s, audio en español e inglés, subtítulos).
#   2. Login → detalle → Descargar → espera "Descargada".
#   3. Modo avión → abre la app: el catálogo no carga → Ver descargas → reproduce → exige el menú de
#      idiomas (el video y sus dos audios salieron del teléfono, no de la red).
#
# Requisitos: `pnpm db:start`, el build de E2E de la web (.next-e2e, lo genera `pnpm test:e2e`) y un
# emulador de teléfono encendido (AVD Phone_API_36).
set -euo pipefail
export JAVA_HOME="${JAVA_HOME:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
PORT=3003
PKG=com.mavros.archiver.local
OUT="$(mktemp -d)"

SERIAL=$("$ADB" devices | awk '$2=="device" && $1 ~ /^emulator-/ {print $1}' | while read s; do
  "$ADB" -s "$s" shell pm list features | grep -q "android.software.leanback" || echo "$s"; done | head -1)
[ -n "$SERIAL" ] || { echo "✗ No hay un emulador de teléfono encendido (solo se prueba en emuladores)"; exit 1; }
export ANDROID_SERIAL="$SERIAL"
echo "Usando $SERIAL"

eval "$(node android/scripts/e2e-tv-seed.mjs env "$PORT")"
node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/helpers/video-cdn-server.ts tests/fixtures/hls 3101 >"$OUT/cdn.log" 2>&1 & CDN=$!; disown
node_modules/.bin/next start -p $PORT >"$OUT/web.log" 2>&1 & WEB=$!; disown
cleanup() {
  "$ADB" shell cmd connectivity airplane-mode disable >/dev/null 2>&1 || true
  kill $CDN $WEB 2>/dev/null || true
  node android/scripts/e2e-tv-seed.mjs cleanup "$OUT/seed.json" >/dev/null 2>&1 || true
}
trap cleanup EXIT
for i in $(seq 1 40); do curl -sf -o /dev/null "http://localhost:$PORT/login" && break; sleep 0.5; done

E2E_HLS=tracks/master.m3u8 node android/scripts/e2e-tv-seed.mjs seed "$OUT/seed.json"
EMAIL=$(python3 -c "import json;print(json.load(open('$OUT/seed.json'))['email'])")
PASSWORD=$(python3 -c "import json;print(json.load(open('$OUT/seed.json'))['password'])")

echo "Compilando e instalando…"
(cd android && ./gradlew :app-mobile:assembleLocalDebug -Pmavros.localSiteUrl=http://10.0.2.2:$PORT -q)
"$ADB" install -r android/app-mobile/build/outputs/apk/local/debug/app-mobile-local-debug.apk >/dev/null
"$ADB" shell pm clear $PKG >/dev/null # sin sesión ni descargas de antes
"$ADB" shell pm grant $PKG android.permission.POST_NOTIFICATIONS >/dev/null 2>&1 || true
"$ADB" shell cmd connectivity airplane-mode disable >/dev/null 2>&1 || true
"$ADB" shell am start -n $PKG/com.mavros.archiver.mobile.MainActivity >/dev/null

ui() { "$ADB" shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; "$ADB" pull /sdcard/ui.xml "$OUT/ui.xml" >/dev/null 2>&1; cat "$OUT/ui.xml"; }
wait_text() { for i in $(seq 1 "${2:-30}"); do ui | grep -qE "$1" && return 0; sleep 1; done; echo "✗ No apareció: $1. En pantalla: $(grep -oE 'content-desc="[^"]+"|text="[^"]+"' "$OUT/ui.xml" | tr '\n' ' ')"; exit 1; }
# Toca el centro del primer nodo cuyo atributo coincide
tap() {
  ui >/dev/null
  local bounds
  bounds=$(python3 - "$OUT/ui.xml" "$1" <<'PY'
import re, sys
xml, pattern = open(sys.argv[1]).read(), sys.argv[2]
for node in re.findall(r'<node [^>]*>', xml):
    if re.search(pattern, node):
        m = re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', node)
        x1, y1, x2, y2 = map(int, m.groups())
        print((x1 + x2) // 2, (y1 + y2) // 2)
        break
PY
)
  [ -n "$bounds" ] || { echo "✗ No encontré $1"; exit 1; }
  "$ADB" shell input tap $bounds
}

wait_text 'text="Email"'
tap 'text="Email"'; "$ADB" shell input text "$EMAIL"
tap 'text="Contraseña"'; "$ADB" shell input text "$PASSWORD"
"$ADB" shell input keyevent KEYCODE_BACK
tap 'text="Entrar"'
wait_text 'Recién agregadas' 40
echo "✓ Login"

tap 'content-desc="Ver Descargas Prueba"'
wait_text 'text="Descargar"'
tap 'text="Descargar"'
wait_text 'Descargada' 90
echo "✓ DL-01 descargada (una calidad, audios y subtítulos)"

"$ADB" shell am force-stop $PKG
"$ADB" shell cmd connectivity airplane-mode enable >/dev/null
sleep 3
"$ADB" shell am start -n $PKG/com.mavros.archiver.mobile.MainActivity >/dev/null
wait_text 'text="Ver descargas"' 40
echo "✓ DL-03 sin internet el catálogo ofrece las descargas"
tap 'text="Ver descargas"'
wait_text 'Descargas Prueba'
tap 'content-desc="Ver Descargas Prueba"'
sleep 6
"$ADB" shell dumpsys activity activities | grep -q "topResumedActivity=.*PlayerActivity" || { echo "✗ No abrió el reproductor"; exit 1; }
# Aviso de pantalla completa del sistema (solo la primera vez)
ui | grep -q 'text="Got it"' && { tap 'text="Got it"'; sleep 1; }
# Con controles visibles: el botón de idiomas solo aparece cuando el video cargó sus dos audios
"$ADB" shell input tap 540 400; sleep 1
ui | grep -q 'content-desc="Audio y subtítulos"' || { echo "✗ DL-04 no cargó el video sin internet. En pantalla: $(grep -oE 'content-desc="[^"]+"|text="[^"]+"|resource-id="[^"]+"' "$OUT/ui.xml" | tr '\n' ' ')"; exit 1; }
echo "✓ DL-04 se reproduce sin internet con sus idiomas"
