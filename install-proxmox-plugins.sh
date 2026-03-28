#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ZIP_FILE="$SCRIPT_DIR/proxmox-plugins.zip"

if [ ! -f "$ZIP_FILE" ]; then
    ZIP_FILE="$SCRIPT_DIR/../proxmox-plugins.zip"
fi

if [ ! -f "$ZIP_FILE" ]; then
    echo "Missing archive: $ZIP_FILE" >&2
    exit 1
fi

[ "$EUID" -ne 0 ] && echo "Error: root privileges required" >&2 && exit 1

WORKDIR="$(mktemp -d)"
cleanup() {
    rm -rf "$WORKDIR"
}
trap cleanup EXIT

python3 - "$ZIP_FILE" "$WORKDIR" <<'PY'
import pathlib
import sys
import zipfile

zip_path = pathlib.Path(sys.argv[1])
dest = pathlib.Path(sys.argv[2])

with zipfile.ZipFile(zip_path) as archive:
    archive.extractall(dest)
PY

bash "$WORKDIR/install.sh"
