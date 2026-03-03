#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: render_silent_audio.sh <source_mp4> <output_mp4>" >&2
  exit 1
fi

source_mp4="$1"
output_mp4="$2"

ffmpeg -y -i "$source_mp4" -f lavfi -i "anullsrc=channel_layout=mono:sample_rate=16000" \
  -map 0:v -map 1:a -c:v libx264 -c:a aac -shortest "$output_mp4"
