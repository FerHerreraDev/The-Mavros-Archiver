#!/usr/bin/env bash
# Sube una carpeta HLS a Cloudflare R2 con rclone (VID-07 de tests/SPEC.md).
#
#   scripts/r2-upload.sh <carpeta local> <prefijo en el bucket>
#
# Usa el remoto de rclone ya configurado (R2_REMOTE, por defecto videos-backup:videos).
# Las credenciales viven en la config de rclone, nunca en el repo.
# Se puede reanudar: rclone salta lo que ya está igual.
set -euo pipefail

DIR="${1:?Uso: r2-upload.sh <carpeta> <prefijo>}"
PREFIX="${2:?Falta el prefijo (ej. movies/mi-pelicula)}"
REMOTE="${R2_REMOTE:-videos-backup:videos}"
DEST="$REMOTE/${PREFIX#/}"
COMMON=(--transfers 16 --checkers 16 --s3-no-check-bucket --stats-one-line --stats 15s)

# 1) Segmentos primero: así nunca hay una playlist publicada que apunte a segmentos que faltan
rclone copy "$DIR" "$DEST" "${COMMON[@]}" --include "*.ts" \
  --header-upload "Content-Type: video/mp2t" \
  --header-upload "Cache-Control: public, max-age=31536000, immutable"
# Subtítulos (VID-12)
rclone copy "$DIR" "$DEST" "${COMMON[@]}" --include "*.vtt" \
  --header-upload "Content-Type: text/vtt" \
  --header-upload "Cache-Control: public, max-age=31536000, immutable"

# 2) Playlists de cada calidad y al final el master
rclone copy "$DIR" "$DEST" "${COMMON[@]}" --include "*/index.m3u8" \
  --header-upload "Content-Type: application/vnd.apple.mpegurl" \
  --header-upload "Cache-Control: public, max-age=300"
rclone copy "$DIR" "$DEST" "${COMMON[@]}" --include "/master.m3u8" \
  --header-upload "Content-Type: application/vnd.apple.mpegurl" \
  --header-upload "Cache-Control: public, max-age=300"

echo "✓ $DEST/master.m3u8"
