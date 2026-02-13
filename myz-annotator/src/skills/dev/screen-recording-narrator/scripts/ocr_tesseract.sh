#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: ocr_tesseract.sh <frame_png> [lang]" >&2
  exit 1
fi

frame="$1"
lang="${2:-chi_sim+eng}"

tesseract "$frame" stdout -l "$lang"
