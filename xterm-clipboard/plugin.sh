#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="/usr/share/pve-xtermjs/index.html.tpl"
JS_FILE="xterm-clipboard.js"
JS_DEST="/usr/share/pve-xtermjs/$JS_FILE"
SCRIPT_MARKER="<!-- PVE_XTERM_CLIPBOARD_SCRIPT -->"
PM_PLUGIN_NAME="xterm-clipboard"
PM_BACKUP_ROOT="$(dirname "$TEMPLATE")/plugin-backups"
. "$SCRIPT_DIR/../plugin-backup.sh"

status() {
    [ -f "$JS_DEST" ] || return 1
    grep -q "$SCRIPT_MARKER" "$TEMPLATE" || return 1
}

install() {
    cp "$SCRIPT_DIR/$JS_FILE" "$JS_DEST"
    chmod 644 "$JS_DEST"

    if ! grep -q "$SCRIPT_MARKER" "$TEMPLATE"; then
        pm_backup_file "$TEMPLATE"
    fi

    python3 <<'PY'
from pathlib import Path

template = Path('/usr/share/pve-xtermjs/index.html.tpl')
text = template.read_text()
marker = '<!-- PVE_XTERM_CLIPBOARD_SCRIPT -->'
snippet = marker + '\n\t<script src="/xtermjs/xterm-clipboard.js"></script>\n'

if marker not in text:
    text = text.replace('\t<script src="/xtermjs/main.js?version=5.5.0-3" defer ></script>', snippet + '\t<script src="/xtermjs/main.js?version=5.5.0-3" defer ></script>', 1)

template.write_text(text)
PY

    systemctl restart pveproxy
}

uninstall() {
    if ! pm_restore_latest_backup; then
        python3 <<'PY'
from pathlib import Path

template = Path('/usr/share/pve-xtermjs/index.html.tpl')
text = template.read_text()
text = text.replace('<!-- PVE_XTERM_CLIPBOARD_SCRIPT -->\n\t<script src="/xtermjs/xterm-clipboard.js"></script>\n', '')
template.write_text(text)
PY
    fi

    rm -f "$PM_BACKUP_ROOT/$PM_PLUGIN_NAME/latest"
    rm -f "$JS_DEST"

    systemctl restart pveproxy
}

case "$1" in
    install) install ;;
    uninstall) uninstall ;;
    status) status ;;
    *) exit 1 ;;
esac
