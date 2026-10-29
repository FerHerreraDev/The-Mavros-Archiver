#!/bin/bash
# Genera Config/{Local,Prod}.generated.xcconfig (no se versionan). Solo valores PÚBLICOS (IPAD-01):
# URL de Supabase, clave anon y URL del sitio. Nunca service role, secreto del video ni TMDB.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/ios/Config"
# En un .xcconfig "//" empieza un comentario: se escribe ":/$()/" (Xcode lo deja como "://")
esc() { printf '%s' "$1" | sed 's#://#:/$()/#'; }

status="$(cd "$ROOT" && node_modules/.bin/supabase status -o json 2>/dev/null || true)"
local_url="$(printf '%s' "$status" | sed -n 's/.*"API_URL": *"\([^"]*\)".*/\1/p')"
local_key="$(printf '%s' "$status" | sed -n 's/.*"ANON_KEY": *"\([^"]*\)".*/\1/p')"
{
  echo "// Simulador → Supabase local (pnpm db:start) y la web local de pruebas"
  echo "MAVROS_SUPABASE_URL = $(esc "${local_url:-http://127.0.0.1:54321}")"
  echo "MAVROS_ANON_KEY = ${local_key:-sin-supabase-local}"
  echo "MAVROS_SITE_URL = $(esc "${MAVROS_LOCAL_SITE_URL:-http://localhost:3100}")"
} > "$OUT/Local.generated.xcconfig"

read_env() { sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*\"\{0,1\}\([^\"]*\)\"\{0,1\}[[:space:]]*$/\1/p" "$ROOT/.env.local" | head -1; }
{
  echo "// Producción (HTTPS). Solo la URL y la clave pública de Supabase"
  echo "MAVROS_SUPABASE_URL = $(esc "$(read_env NEXT_PUBLIC_SUPABASE_URL)")"
  echo "MAVROS_ANON_KEY = $(read_env NEXT_PUBLIC_SUPABASE_ANON_KEY)"
  echo "MAVROS_SITE_URL = $(esc https://the-mavros-archiver.vercel.app)"
} > "$OUT/Prod.generated.xcconfig"
echo "Config generada en $OUT"
