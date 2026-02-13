#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 3 ]]; then
  echo "Usage: concat_filter.sh <output_mp4> <input1.mp4> <input2.mp4> [input3.mp4 ...]" >&2
  exit 1
fi

output_mp4="$1"
shift
inputs=("$@")

args=()
filter=""
for i in "${!inputs[@]}"; do
  args+=( -i "${inputs[$i]}" )
  filter+="[${i}:v][${i}:a]"
done
filter+="concat=n=${#inputs[@]}:v=1:a=1[v][a]"

ffmpeg -y "${args[@]}" \
  -filter_complex "$filter" \
  -map "[v]" -map "[a]" \
  -c:v libx264 -crf 18 -c:a aac -b:a 192k \
  -movflags +faststart "$output_mp4"
