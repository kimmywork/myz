#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: convert_mp4_with_audio.sh <input> <output>" >&2
  exit 1
fi

input="$1"
output="$2"

ffmpeg -y -i "$input" -c:v libx264 -preset medium -crf 18 -c:a aac -b:a 192k "$output"
