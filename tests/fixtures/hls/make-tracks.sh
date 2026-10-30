#!/usr/bin/env bash
# Genera tests/fixtures/hls/tracks: video sintético de 12 s con audio en español e inglés y
# subtítulos en español (VID-11, VID-12), codificado con el mismo scripts/encode-hls.sh.
# Lo usa la E2E de WATCH-05.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$HERE/tracks"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
rm -rf "$OUT"
for i in $(seq 0 29); do
  printf '%d\n00:00:%02d,%03d --> 00:00:%02d,%03d\nSubtítulo %d\n\n' $((i + 1)) $((i * 400 / 1000)) $((i * 400 % 1000)) $(((i * 400 + 350) / 1000)) $(((i * 400 + 350) % 1000)) $((i + 1))
done > "$TMP/es.srt"
ffmpeg -hide_banner -nostdin -y -v error \
  -f lavfi -i "testsrc2=size=854x356:rate=24:duration=12" \
  -f lavfi -i "sine=frequency=440:sample_rate=48000:duration=12" \
  -f lavfi -i "sine=frequency=660:sample_rate=48000:duration=12" \
  -i "$TMP/es.srt" \
  -map 0 -map 1 -map 2 -map 3 -c:v libx264 -preset veryfast -c:a aac -b:a 64k -c:s srt \
  -metadata:s:a:0 language=spa -metadata:s:a:1 language=eng -metadata:s:s:0 language=spa \
  "$TMP/source.mkv"
PRESET=veryfast "$HERE/../../../scripts/encode-hls.sh" "$TMP/source.mkv" "$OUT" > /dev/null 2>&1
echo "✓ $OUT"
