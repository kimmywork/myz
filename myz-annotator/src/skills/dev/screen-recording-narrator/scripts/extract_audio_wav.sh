#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: extract_audio_wav.sh <input_mp4> <output_wav>" >&2
  exit 1
fi

input="$1"
output="$2"

ffmpeg -y -i "$input" -vn -ac 1 -ar 16000 "$output"
