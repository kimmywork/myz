#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 3 ]]; then
  echo "Usage: scenedetect.sh <input_mp4> <threshold> <output_dir>" >&2
  exit 1
fi

input="$1"
threshold="$2"
output_dir="$3"

mkdir -p "$output_dir"
scenedetect -i "$input" detect-content -t "$threshold" list-scenes -o "$output_dir"
