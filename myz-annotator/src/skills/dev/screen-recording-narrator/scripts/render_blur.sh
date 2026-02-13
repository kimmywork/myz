#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 5 ]]; then
  echo "Usage: render_blur.sh <source_mp4> <audio_wav> <output_mp4> <width> <height> [fps]" >&2
  exit 1
fi

source_mp4="$1"
audio_wav="$2"
output_mp4="$3"
width="$4"
height="$5"
fps="${6:-30}"

ffmpeg -y -i "$source_mp4" -i "$audio_wav" \
  -filter_complex "[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},boxblur=20:1[bg];[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2[v]" \
  -map "[v]" -map 1:a -r "$fps" -c:v libx264 -crf 18 -c:a aac -b:a 192k -shortest "$output_mp4"
