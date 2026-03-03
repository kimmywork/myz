#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: preflight_check_audio_stream.sh <video>" >&2
  exit 1
fi

video="$1"
ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "$video"
