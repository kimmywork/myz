#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 3 ]]; then
  echo "Usage: ocr_extract_frames.sh <input_mp4> <interval_sec> <frames_dir> [WxH]" >&2
  exit 1
fi

input="$1"
interval_sec="$2"
frames_dir="$3"
size="${4:-}"

mkdir -p "$frames_dir"

vf="fps=1/${interval_sec}"
if [[ -n "$size" ]]; then
  width="${size%x*}"
  height="${size#*x}"
  vf="${vf},scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2"
fi
vf="${vf},showinfo"

ffmpeg -y -i "$input" -vf "$vf" -vsync vfr "${frames_dir}/%04d.png" 2> "${frames_dir}/showinfo.log"

rg "pts_time" "${frames_dir}/showinfo.log" \
  | awk -F'pts_time:' '{print $2}' \
  | awk '{print $1}' > "${frames_dir}/pts.txt"

ls "${frames_dir}/"*.png | sort \
  | paste -d $'\\t' - "${frames_dir}/pts.txt" \
  > "${frames_dir}/frames.tsv"
