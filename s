#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/scripts"
ALLOWED_EXTENSIONS=(sh py rb js)

usage() {
    echo "Usage: $0 <module> <action>" >&2
    exit 1
}

die() {
    echo "Error: $1" >&2
    exit 1
}

is_allowed_extension() {
    local ext="$1"
    for allowed in "${ALLOWED_EXTENSIONS[@]}"; do
        [[ "$ext" == "$allowed" ]] && return 0
    done
    return 1
}

find_unique_module() {
    local query="$1" path name matches=()
    shopt -s nullglob
    for path in "$SCRIPT_DIR"/*/; do
        name="${path%/}"
        name="${name##*/}"
        [[ "$name" == "$query"* ]] && matches+=("$name")
    done
    shopt -u nullglob
    case ${#matches[@]} in
        0) die "No module matching '$query' found." ;;
        1) MODULE="${matches[0]}" ;;
        *) die "Multiple modules match '$query'; please be more specific." ;;
    esac
}

find_unique_action() {
    local module="$1" query="$2" path name ext matches=()
    shopt -s nullglob
    for path in "$SCRIPT_DIR/$module"/*; do
        [[ -f "$path" ]] || continue
        name="${path##*/}"
        ext="${name##*.}"
        is_allowed_extension "$ext" || continue
        [[ "$name" == "$query"* ]] && matches+=("$name")
    done
    shopt -u nullglob
    case ${#matches[@]} in
        0) die "No action matching '$query' found in module '$module'." ;;
        1) ACTION_FILE="${matches[0]}" ;;
        *) die "Multiple actions match '$query' in module '$module'; please be more specific." ;;
    esac
}

[[ $# -eq 2 ]] || usage

find_unique_module "$1"
find_unique_action "$MODULE" "$2"

SCRIPT_PATH="$SCRIPT_DIR/$MODULE/$ACTION_FILE"
[[ -r "$SCRIPT_PATH" ]] || die "Script '$SCRIPT_PATH' is not readable."

case "$SCRIPT_PATH" in
    *.sh)
        exec bash "$SCRIPT_PATH"
        ;;
    *.py)
        exec python3 "$SCRIPT_PATH"
        ;;
    *.rb)
        exec ruby "$SCRIPT_PATH"
        ;;
    *.js)
        exec node "$SCRIPT_PATH"
        ;;
    *)
        die "Unsupported script type: ${SCRIPT_PATH##*.}"
        ;;
esac
