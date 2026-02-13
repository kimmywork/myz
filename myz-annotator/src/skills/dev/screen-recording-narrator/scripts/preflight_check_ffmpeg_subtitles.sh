#!/usr/bin/env bash
set -euo pipefail

if ffmpeg -filters | rg -q "subtitles"; then
  echo "ffmpeg subtitles filter available"
  exit 0
fi

if command -v mpv >/dev/null 2>&1; then
  echo "ffmpeg subtitles filter missing; mpv available for burn-in"
  exit 0
fi

echo "No ffmpeg subtitles filter and mpv not found"
exit 1
