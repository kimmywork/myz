#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 5 ]]; then
  echo "Usage: render_pad.sh <source_mp4> <audio_wav> <output_mp4> <width> <height> [fps]" >&2
  exit 1
fi

source_mp4="$1"
audio_wav="$2"
output_mp4="$3"
width="$4"
height="$5"
fps="${6:-30}"

ffmpeg -y -i "$source_mp4" -i "$audio_wav" \
  -vf "scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black" \
  -map 0:v -map 1:a -r "$fps" -c:v libx264 -crf 18 -c:a aac -b:a 192k -shortest "$output_mp4"
