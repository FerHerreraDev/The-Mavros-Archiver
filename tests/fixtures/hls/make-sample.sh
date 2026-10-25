#!/usr/bin/env bash
# Genera tests/fixtures/hls/sample: video sintético de 12 s, 2 calidades, segmentos de 6 s.
# Es pequeño a propósito (~1 MB) para que la E2E reproduzca video real sin depender de R2.
set -euo pipefail
OUT="$(dirname "$0")/sample"
rm -rf "$OUT" && mkdir -p "$OUT"
ffmpeg -hide_banner -nostdin -y -v error \
  -f lavfi -i "testsrc2=size=854x356:rate=24:duration=12" \
  -f lavfi -i "sine=frequency=440:sample_rate=48000:duration=12" \
  -filter_complex "[0:v]split=2[a][b];[b]scale=640:-2[b2]" \
  -map "[a]" -map 1:a -map "[b2]" -map 1:a \
  -c:v libx264 -preset veryfast -profile:v high -pix_fmt yuv420p \
  -x264-params "keyint=144:min-keyint=144:scenecut=0:open-gop=0" \
  -b:v:0 350k -b:v:1 200k -c:a aac -b:a 64k \
  -f hls -hls_time 6 -hls_playlist_type vod -hls_flags independent_segments \
  -hls_segment_filename "$OUT/%v/seg_%05d.ts" -master_pl_name master.m3u8 \
  -var_stream_map "v:0,a:0,name:480p v:1,a:1,name:360p" "$OUT/%v/index.m3u8"
