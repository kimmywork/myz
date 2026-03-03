#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: concat_list.sh <concat_list.txt> <output_mp4>" >&2
  exit 1
fi

concat_list="$1"
output_mp4="$2"

ffmpeg -y -f concat -safe 0 -i "$concat_list" -c:v libx264 -c:a aac -movflags +faststart "$output_mp4"
