#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PVELIB="/usr/share/pve-manager/js/pvemanagerlib.js"
BACKUP="/usr/share/pve-manager/js/pvemanagerlib.js.orig"
TEMPLATE="/usr/share/pve-manager/index.html.tpl"
JS_FILE="vm-folders-ui.js"
JS_DEST="/usr/share/pve-manager/js/$JS_FILE"
SCRIPT_MARKER="<!-- PVE_VM_FOLDERS_SCRIPT -->"
PM_PLUGIN_NAME="vm-folders"
PM_BACKUP_ROOT="$(dirname "$TEMPLATE")/plugin-backups"
. "$SCRIPT_DIR/../plugin-backup.sh"

restore_legacy_patch() {
    if grep -q "VMFOLDERS_NATIVE\|VMFOLDERS_PATCHED" "$PVELIB" 2>/dev/null && [ -f "$BACKUP" ]; then
        cp "$BACKUP" "$PVELIB"
    fi
}

status() {
    [ -f "$JS_DEST" ] || return 1
    grep -q "$JS_FILE" "$TEMPLATE" || return 1
}

install() {
    restore_legacy_patch

    cp "$SCRIPT_DIR/$JS_FILE" "$JS_DEST"
    chmod 644 "$JS_DEST"

    if ! grep -q "$SCRIPT_MARKER" "$TEMPLATE"; then
        pm_backup_file "$TEMPLATE"
    fi

    python3 <<'PY'
from pathlib import Path

template = Path('/usr/share/pve-manager/index.html.tpl')
text = template.read_text()

marker = '<!-- PVE_VM_FOLDERS_SCRIPT -->'
script = marker + '\n<script src="/pve2/js/vm-folders-ui.js"></script>'

text = text.replace('<script src="/pve2/js/vm-folders-ui.js"></script>\n', '')
text = text.replace('<script src="/pve2/js/vm-folders-ui.js"></script>', '')
text = text.replace(marker + '\n', '')

if marker not in text:
    text = text.replace('</body>', script + '\n</body>', 1)

template.write_text(text)
PY

    systemctl restart pveproxy
}

uninstall() {
    restore_legacy_patch

    if ! pm_restore_latest_backup; then
        python3 <<'PY'
from pathlib import Path

template = Path('/usr/share/pve-manager/index.html.tpl')
text = template.read_text()
text = text.replace('<!-- PVE_VM_FOLDERS_SCRIPT -->\n<script src="/pve2/js/vm-folders-ui.js"></script>\n', '')
text = text.replace('<!-- PVE_VM_FOLDERS_SCRIPT -->\n<script src="/pve2/js/vm-folders-ui.js"></script>', '')
text = text.replace('<script src="/pve2/js/vm-folders-ui.js"></script>\n', '')
text = text.replace('<script src="/pve2/js/vm-folders-ui.js"></script>', '')
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
