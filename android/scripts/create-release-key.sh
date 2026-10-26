#!/usr/bin/env bash
# Crea TU llave de firma para las versiones release (teléfono y tele). Se corre UNA vez.
# La llave y sus contraseñas quedan en ~/.mavros/ (fuera del repositorio, nunca se suben).
# keytool te pedirá la contraseña: la escribes tú; este script no la ve ni la guarda en otro lado.
set -euo pipefail
DIR="$HOME/.mavros"
KEY="$DIR/mavros-release.jks"
PROPS="$DIR/keystore.properties"
KEYTOOL="${JAVA_HOME:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}/bin/keytool"

[ -e "$KEY" ] && { echo "Ya existe $KEY. No se sobrescribe (perderla impediría actualizar las apps)."; exit 1; }
mkdir -p "$DIR" && chmod 700 "$DIR"

echo "Elige una contraseña (mínimo 6 caracteres). La pedirá dos veces."
read -r -s -p "Contraseña de la llave: " PASS; echo
read -r -s -p "Repítela: " PASS2; echo
[ "$PASS" = "$PASS2" ] || { echo "No coinciden."; exit 1; }
[ ${#PASS} -ge 6 ] || { echo "Muy corta."; exit 1; }

# La contraseña va por variable de entorno, no como argumento (no aparece en la lista de procesos)
MAVROS_KEY_PASS="$PASS" "$KEYTOOL" -genkeypair -keystore "$KEY" -alias mavros -keyalg RSA -keysize 4096 -validity 36500 \
  -storepass:env MAVROS_KEY_PASS -keypass:env MAVROS_KEY_PASS -dname "CN=The Mavros Archiver, O=Mavros" >/dev/null

umask 077
cat > "$PROPS" <<PROPS
storeFile=$KEY
storePassword=$PASS
keyAlias=mavros
keyPassword=$PASS
PROPS
chmod 600 "$KEY" "$PROPS"
unset PASS PASS2

echo "✓ Llave creada en $KEY"
echo "  RESPALDA estos dos archivos (gestor de contraseñas o USB): sin ellos no podrás actualizar las apps."
echo "    $KEY"
echo "    $PROPS"
