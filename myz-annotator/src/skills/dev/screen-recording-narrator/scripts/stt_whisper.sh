#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 3 ]]; then
  echo "Usage: stt_whisper.sh <model_path> <input_wav> <output_base>" >&2
  exit 1
fi

model_path="$1"
input="$2"
output_base="$3"

whisper-cli -m "$model_path" -f "$input" -osrt -of "$output_base"
