#!/usr/bin/env bash
# IPAD-01: busca en la app ya compilada (Mavros.app) los VALORES de los secretos del servidor.
# Los valores se leen de .env.local y del Supabase local, y nunca se imprimen.
#   ios/scripts/check-app-secrets.sh <Mavros.app>
set -euo pipefail
APP="${1:?Uso: check-app-secrets.sh <Mavros.app>}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

secrets=()
if [ -f "$ROOT/.env.local" ]; then
  # || [ -n "$key" ]: también la última línea aunque no termine en salto de línea
  while IFS='=' read -r key value || [ -n "$key" ]; do
    value="${value%\"}"; value="${value#\"}"
    case "$key" in SUPABASE_SERVICE_ROLE_KEY|VIDEO_TOKEN_SECRET|TMDB_API_KEY|R2_ACCESS_KEY_ID|R2_SECRET_ACCESS_KEY) [ -n "$value" ] && secrets+=("$key=$value") ;; esac
  done < "$ROOT/.env.local"
fi
local_service=$("$ROOT/node_modules/.bin/supabase" status -o json 2>/dev/null | python3 -c "import sys,json;raw=sys.stdin.read();print(json.loads(raw[raw.find('{'):]).get('SERVICE_ROLE_KEY','') if '{' in raw else '')" 2>/dev/null || true)
[ -n "$local_service" ] && secrets+=("LOCAL_SERVICE_ROLE_KEY=$local_service")

fail=0
for entry in "${secrets[@]}"; do
  name="${entry%%=*}"; value="${entry#*=}"
  if LC_ALL=C grep -rqaF -- "$value" "$APP"; then echo "✗ $name aparece en la app"; fail=1; else echo "✓ $name no aparece"; fi
done
if LC_ALL=C grep -rqaE -- "sb_secret_[A-Za-z0-9_-]{16,}" "$APP"; then echo "✗ hay una clave sb_secret_ en la app"; fail=1; else echo "✓ ninguna clave sb_secret_"; fi
# Producción va por HTTPS: la app de producción no debe apuntar a la Mac
if plutil -extract MavrosSupabaseURL raw "$APP/Info.plist" | grep -q '^https://'; then echo "✓ Supabase por HTTPS"; else echo "✗ la URL de Supabase no es HTTPS"; fail=1; fi
echo "(${#secrets[@]} secretos revisados en $(find "$APP" -type f | wc -l | tr -d ' ') archivos)"
exit $fail
