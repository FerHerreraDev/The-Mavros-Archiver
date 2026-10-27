#!/usr/bin/env bash
# MOB-01: busca en un APK ya compilado los VALORES de los secretos del servidor.
# Los valores se leen de .env.local y del Supabase local, y nunca se imprimen.
#   android/scripts/check-apk-secrets.sh <archivo.apk>
set -euo pipefail
APK="${1:?Uso: check-apk-secrets.sh <apk>}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
unzip -q -o "$APK" -d "$TMP"

secrets=()
if [ -f "$ROOT/.env.local" ]; then
  # || [ -n "$key" ]: también la última línea aunque no termine en salto de línea
  while IFS='=' read -r key value || [ -n "$key" ]; do
    case "$key" in SUPABASE_SERVICE_ROLE_KEY|VIDEO_TOKEN_SECRET|TMDB_API_KEY) [ -n "$value" ] && secrets+=("$key=$value") ;; esac
  done < "$ROOT/.env.local"
fi
local_service=$("$ROOT/node_modules/.bin/supabase" status -o json 2>/dev/null | python3 -c "import sys,json;raw=sys.stdin.read();print(json.loads(raw[raw.find('{'):]).get('SERVICE_ROLE_KEY','') if '{' in raw else '')" 2>/dev/null || true)
[ -n "$local_service" ] && secrets+=("LOCAL_SERVICE_ROLE_KEY=$local_service")

fail=0
for entry in "${secrets[@]}"; do
  name="${entry%%=*}"; value="${entry#*=}"
  if grep -rqF -- "$value" "$TMP"; then echo "✗ $name aparece en el APK"; fail=1; else echo "✓ $name no aparece"; fi
done
# Una clave real es "sb_secret_" + ~20 caracteres o más. El prefijo solo aparece dentro de supabase-kt,
# que lo usa para RECHAZAR claves secretas en clientes; eso no es una clave.
if LC_ALL=C grep -rqaE -- "sb_secret_[A-Za-z0-9_-]{16,}" "$TMP"; then echo "✗ hay una clave sb_secret_ en el APK"; fail=1; else echo "✓ ninguna clave sb_secret_"; fi
echo "(${#secrets[@]} secretos revisados en $(find "$TMP" -type f | wc -l | tr -d ' ') archivos)"
exit $fail
