#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 4 ]]; then
  echo "Usage: ocr_ollama_vision.sh <model> <image> <prompt_file> <output_file>" >&2
  exit 1
fi

model="$1"
image="$2"
prompt_file="$3"
output_file="$4"

if [[ "$image" != /* ]]; then
  image="$(cd "$(dirname "$image")" && pwd)/$(basename "$image")"
fi

prompt=$(cat "$prompt_file")

if [[ ! -t 1 ]]; then
  echo "Warning: run in an interactive terminal so ollama can attach the image." >&2
fi

ollama run "$model" "$image" "$prompt" > "$output_file"
