#!/usr/bin/env bash
# Compila la app de producción, revisa que no lleve secretos (IPAD-01) y la instala en el iPad conectado.
#   ios/scripts/install-ipad.sh            → instala en el iPad conectado por cable (o en la misma Wi-Fi ya emparejado)
#   ios/scripts/install-ipad.sh --revisar  → solo compila sin firmar y revisa secretos (no necesita iPad ni Apple ID)
# Requisitos para instalar: tu Apple ID en Xcode → Settings → Accounts, y el iPad con Modo de desarrollador.
# Opcionales: MAVROS_TEAM=<Team ID> si tienes varios equipos; MAVROS_BUNDLE_ID si Apple dice que el id ya está ocupado.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
DD="$ROOT/ios/.build/device"
cd "$ROOT/ios"
scripts/gen-config.sh >/dev/null
xcodegen -q

build() { xcodebuild build -project MavrosArchiver.xcodeproj -scheme MavrosArchiver -configuration Prod -derivedDataPath "$DD" -quiet "$@"; }
APP="$DD/Build/Products/Prod-iphoneos/Mavros.app"

if [ "${1:-}" = "--revisar" ]; then
  build -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO
  scripts/check-app-secrets.sh "$APP"
  exit
fi

# El iPad físico conectado (cable o red ya emparejada)
JSON="$(mktemp)"; trap 'rm -f "$JSON"' EXIT
xcrun devicectl list devices --json-output "$JSON" >/dev/null 2>&1 || true
UDID="$(python3 - "$JSON" <<'PY'
import json, sys
try: devices = json.load(open(sys.argv[1]))["result"]["devices"]
except Exception: devices = []
for d in devices:
    hw = d.get("hardwareProperties", {})
    if hw.get("reality") == "physical" and hw.get("deviceType") == "iPad":
        print(hw.get("udid", "")); break
PY
)"
[ -n "$UDID" ] || { echo "No encuentro un iPad. Conéctalo por cable, desbloquéalo y toca \"Confiar\"."; exit 1; }

# Tu equipo de firma (la cuenta gratis de Apple ID sirve: la app dura 7 días y se reinstala con este script)
TEAM="${MAVROS_TEAM:-$(defaults export com.apple.dt.Xcode - 2>/dev/null | python3 -c '
import plistlib, sys
try: teams = plistlib.loads(sys.stdin.buffer.read()).get("IDEProvisioningTeamByIdentifier", {})
except Exception: teams = {}
ids = [t.get("teamID") for account in teams.values() for t in account if t.get("teamID")]
print(ids[0] if ids else "")')}"
[ -n "$TEAM" ] || { echo "No hay Apple ID en Xcode. Abre Xcode → Settings → Accounts → + → Apple ID y vuelve a correr esto."; exit 1; }

echo "Compilando para el iPad ($UDID) con el equipo $TEAM…"
build -destination "id=$UDID" -allowProvisioningUpdates -allowProvisioningDeviceRegistration \
  DEVELOPMENT_TEAM="$TEAM" CODE_SIGN_STYLE=Automatic PRODUCT_BUNDLE_IDENTIFIER="${MAVROS_BUNDLE_ID:-com.mavros.archiver.ipad}"
scripts/check-app-secrets.sh "$APP"
xcrun devicectl device install app --device "$UDID" "$APP"
echo
echo "Listo: \"Mavros\" está en el iPad."
echo "Si al abrirla dice \"Desarrollador no confiable\": Ajustes → General → VPN y gestión de dispositivos → tu Apple ID → Confiar."
