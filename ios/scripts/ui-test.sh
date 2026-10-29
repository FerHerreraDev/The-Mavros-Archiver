#!/bin/bash
# Pruebas de interfaz de la app del iPad en el simulador, contra el Supabase LOCAL (pnpm db:start).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
SEED="$(mktemp)"
PIDS=""
cleanup() {
  node "$ROOT/ios/scripts/ui-seed.mjs" cleanup "$SEED" >/dev/null 2>&1 || true
  rm -f "$SEED"
  [ -n "$PIDS" ] && kill $PIDS 2>/dev/null || true
}
trap cleanup EXIT
cd "$ROOT" && node ios/scripts/ui-seed.mjs seed "$SEED" >/dev/null

# El reproductor necesita /api/playback (la web de pruebas en :3100) y el Worker de video falso con el HLS de prueba (:3101)
SECRET="test-video-token-secret-0123456789abcdef"
STATUS="$(node_modules/.bin/supabase status -o json 2>/dev/null)"
val() { printf '%s' "$STATUS" | sed -n "s/.*\"$1\": *\"\([^\"]*\)\".*/\1/p"; }
VIDEO_TOKEN_SECRET="$SECRET" node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/helpers/video-cdn-server.ts tests/fixtures/hls 3101 >/dev/null 2>&1 & PIDS="$PIDS $!"
[ -d .next-e2e ] || { echo "Falta .next-e2e: corre pnpm test:e2e una vez para compilar la web de pruebas"; exit 1; }
NEXT_DIST_DIR=.next-e2e NEXT_PUBLIC_SUPABASE_URL="$(val API_URL)" NEXT_PUBLIC_SUPABASE_ANON_KEY="$(val ANON_KEY)" \
SUPABASE_SERVICE_ROLE_KEY="$(val SERVICE_ROLE_KEY)" NEXT_PUBLIC_SITE_URL=http://localhost:3100 \
VIDEO_CDN_URL=http://127.0.0.1:3101 VIDEO_TOKEN_SECRET="$SECRET" pnpm exec next start -p 3100 >/dev/null 2>&1 & PIDS="$PIDS $!"
for i in $(seq 1 60); do curl -s -o /dev/null http://localhost:3100/login && break; sleep 1; done
read_seed() { node -e "console.log(JSON.parse(require('fs').readFileSync('$SEED','utf8'))['$1'])"; }
cd "$ROOT/ios" && scripts/gen-config.sh >/dev/null && xcodegen -q >/dev/null
DEST="${IPAD_DESTINATION:-platform=iOS Simulator,name=iPad Mavros}"
# TEST_RUNNER_*: llegan a las pruebas sin el prefijo
TEST_RUNNER_MAVROS_EMAIL="$(read_seed email)" TEST_RUNNER_MAVROS_PASSWORD="$(read_seed password)" \
TEST_RUNNER_MAVROS_SERIES_ID="$(read_seed seriesId)" TEST_RUNNER_MAVROS_MOVIE_ID="$(read_seed movieId)" \
  xcodebuild test -project MavrosArchiver.xcodeproj -scheme MavrosArchiver -configuration Local -destination "$DEST" "$@"
