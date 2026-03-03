#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: concat_wav.sh <concat_list.txt> <output_wav>" >&2
  exit 1
fi

concat_list="$1"
output="$2"

ffmpeg -y -f concat -safe 0 -i "$concat_list" -c copy "$output"
