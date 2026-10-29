#!/bin/bash
# Pruebas de MavrosKit en la Mac: reglas (siempre) + integración contra el Supabase LOCAL (pnpm db:start).
# Nunca toca producción: LocalSupabase aborta si la URL no es 127.0.0.1/localhost.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
export MAVROS_SUPABASE_STATUS="$(cd "$ROOT" && node_modules/.bin/supabase status -o json 2>/dev/null || true)"
cd "$ROOT/ios/MavrosKit" && swift test "$@"
