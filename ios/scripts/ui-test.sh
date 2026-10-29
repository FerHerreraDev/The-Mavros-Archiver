#!/bin/bash
# Pruebas de interfaz de la app del iPad en el simulador, contra el Supabase LOCAL (pnpm db:start).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
SEED="$(mktemp)"
trap 'node "$ROOT/ios/scripts/ui-seed.mjs" cleanup "$SEED" >/dev/null 2>&1 || true; rm -f "$SEED"' EXIT
cd "$ROOT" && node ios/scripts/ui-seed.mjs seed "$SEED" >/dev/null
read_seed() { node -e "console.log(JSON.parse(require('fs').readFileSync('$SEED','utf8'))['$1'])"; }
cd "$ROOT/ios" && scripts/gen-config.sh >/dev/null && xcodegen -q >/dev/null
DEST="${IPAD_DESTINATION:-platform=iOS Simulator,name=iPad Mavros}"
# TEST_RUNNER_*: llegan a las pruebas sin el prefijo
TEST_RUNNER_MAVROS_EMAIL="$(read_seed email)" TEST_RUNNER_MAVROS_PASSWORD="$(read_seed password)" \
TEST_RUNNER_MAVROS_SERIES_ID="$(read_seed seriesId)" TEST_RUNNER_MAVROS_MOVIE_ID="$(read_seed movieId)" \
  xcodebuild test -project MavrosArchiver.xcodeproj -scheme MavrosArchiver -configuration Local -destination "$DEST" "$@"
