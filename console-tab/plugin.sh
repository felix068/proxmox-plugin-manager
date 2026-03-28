#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE="/usr/share/pve-manager/index.html.tpl"
JS_FILE="console-tab.js"
JS_DEST="/usr/share/pve-manager/js/$JS_FILE"
SCRIPT_MARKER="<!-- PVE_CONSOLE_TAB_SCRIPT -->"
PM_PLUGIN_NAME="console-tab"
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

template = Path('/usr/share/pve-manager/index.html.tpl')
text = template.read_text()
marker = '<!-- PVE_CONSOLE_TAB_SCRIPT -->'
snippet = marker + '\n    <script src="/pve2/js/console-tab.js"></script>'

text = text.replace('    <script src="/pve2/js/console-tab.js"></script>\n', '')
text = text.replace('    <script src="/pve2/js/console-tab.js"></script>', '')
text = text.replace(marker + '\n', '')

if marker not in text:
    text = text.replace('</body>', snippet + '\n</body>', 1)

template.write_text(text)
PY

    systemctl restart pveproxy
}

uninstall() {
    if ! pm_restore_latest_backup; then
        python3 <<'PY'
from pathlib import Path

template = Path('/usr/share/pve-manager/index.html.tpl')
text = template.read_text()
text = text.replace('<!-- PVE_CONSOLE_TAB_SCRIPT -->\n    <script src="/pve2/js/console-tab.js"></script>\n', '')
text = text.replace('<!-- PVE_CONSOLE_TAB_SCRIPT -->\n    <script src="/pve2/js/console-tab.js"></script>', '')
text = text.replace('    <script src="/pve2/js/console-tab.js"></script>\n', '')
text = text.replace('    <script src="/pve2/js/console-tab.js"></script>', '')
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
