#!/usr/bin/env bash
# Codifica una película a HLS multi-calidad (cumple VID-01..VID-06 de tests/SPEC.md).
#
#   scripts/encode-hls.sh "<video original>" <carpeta de salida> [segundos]
#
# - Calidades: la original + 1280/854/640 de ancho (solo las menores que el original)
# - Keyframe cada 6 s exactos y sin cortes por escena -> segmentos de 6 s alineados entre calidades
# - Audio copiado sin recodificar (no pierde calidad)
# - [segundos] opcional: codifica solo ese tramo (para pruebas rápidas)
set -euo pipefail

IN="${1:?Uso: encode-hls.sh <entrada> <salida> [segundos]}"
OUT="${2:?Falta la carpeta de salida}"
LIMIT="${3:-}"
SEGMENT=6
PRESET="${PRESET:-slow}"

probe() { ffprobe -v error -select_streams v:0 -show_entries "stream=$1" -of default=nw=1:nk=1 "$IN"; }
# Nombre por ancho, como se conocen las calidades (1920x800 en 2.4:1 sigue siendo "1080p")
label() { if (( $1 >= 3840 )); then echo 2160p; elif (( $1 >= 2560 )); then echo 1440p; elif (( $1 >= 1920 )); then echo 1080p; elif (( $1 >= 1280 )); then echo 720p; elif (( $1 >= 854 )); then echo 480p; else echo 360p; fi; }
WIDTH=$(probe width)
FPS_FRAC=$(probe r_frame_rate)
# keyint = fps * 6, redondeado (23.976 fps -> 144 frames = 6.006 s)
KEYINT=$(python3 -c "from fractions import Fraction as F; print(round(F('$FPS_FRAC') * $SEGMENT))")

# ancho -> crf, maxrate (kbps); la primera es siempre el original
declare -a WIDTHS=("$WIDTH") CRFS=(19) MAXRATES=(3000) NAMES=("$(label "$WIDTH")")
for rung in "1280 21 1600" "854 22 900" "640 23 500"; do
  read -r w crf rate <<<"$rung"
  if (( w < WIDTH )); then
    WIDTHS+=("$w"); CRFS+=("$crf"); MAXRATES+=("$rate")
    NAMES+=("$(label "$w")")
  fi
done
N=${#WIDTHS[@]}

FILTER="[0:v]split=$N$(for i in $(seq 0 $((N-1))); do printf '[s%d]' "$i"; done)"
MAPS=() RATES=() STREAM_MAP=""
for i in $(seq 0 $((N-1))); do
  if (( i == 0 )); then FILTER+=";[s0]null[o0]"
  else FILTER+=";[s$i]scale=${WIDTHS[$i]}:-2:flags=lanczos[o$i]"; fi
  MAPS+=(-map "[o$i]" -map 0:a:0)
  RATES+=("-crf:v:$i" "${CRFS[$i]}" "-maxrate:v:$i" "${MAXRATES[$i]}k" "-bufsize:v:$i" "$(( MAXRATES[$i] * 2 ))k")
  STREAM_MAP+="v:$i,a:$i,name:${NAMES[$i]} "
done

mkdir -p "$OUT"
echo "Calidades: ${NAMES[*]} | keyint=$KEYINT (${SEGMENT}s) | preset=$PRESET"

ffmpeg -hide_banner -nostdin -y ${LIMIT:+-t "$LIMIT"} -i "$IN" \
  -filter_complex "$FILTER" "${MAPS[@]}" \
  -c:v libx264 -preset "$PRESET" -profile:v high -pix_fmt yuv420p \
  -x264-params "keyint=$KEYINT:min-keyint=$KEYINT:scenecut=0:open-gop=0" \
  "${RATES[@]}" \
  -c:a copy \
  -f hls -hls_time "$SEGMENT" -hls_playlist_type vod -hls_flags independent_segments \
  -hls_segment_filename "$OUT/%v/seg_%05d.ts" \
  -master_pl_name master.m3u8 \
  -var_stream_map "${STREAM_MAP% }" \
  "$OUT/%v/index.m3u8"

echo "Listo: $OUT/master.m3u8"
