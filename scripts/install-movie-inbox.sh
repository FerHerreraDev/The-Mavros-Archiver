#!/usr/bin/env bash
# Instala (o quita con --quitar) el servicio que revisa ~/Movies/Mavros/Entrada cada 5 minutos (VID-09).
#   scripts/install-movie-inbox.sh            instala y arranca
#   scripts/install-movie-inbox.sh --quitar   lo detiene y lo quita
# Registro: ~/Library/Logs/mavros-inbox.log
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LABEL=com.mavros.movie-inbox
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
NODE="$(command -v node)"

launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
if [ "${1:-}" = "--quitar" ]; then rm -f "$PLIST"; echo "✓ Servicio quitado"; exit 0; fi

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Movies/Mavros/Entrada"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$NODE</string><string>$ROOT/scripts/movie-inbox.mjs</string></array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>StartInterval</key><integer>300</integer>
  <key>RunAtLoad</key><true/>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string></dict>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/mavros-inbox.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/mavros-inbox.log</string>
  <!-- Standard, no Background: en Apple Silicon "Background" deja a ffmpeg solo en los núcleos de eficiencia (decenas de horas por película) -->
  <key>ProcessType</key><string>Standard</string>
</dict>
</plist>
PLIST
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "✓ Servicio instalado: revisa ~/Movies/Mavros/Entrada cada 5 minutos"
echo "  Registro: ~/Library/Logs/mavros-inbox.log"
