#!/bin/bash
set -euo pipefail

if [ "${EUID:-$(id -u)}" -ne 0 ]; then
    echo "Run as root." >&2
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SCRIPT_DIR/plugin-backup.sh"

PM_PLUGIN_NAME="plugin-manager"
PM_BACKUP_ROOT="/usr/share/pve-manager/plugin-backups"

if pm_restore_latest_backup; then
    systemctl daemon-reload
    systemctl restart pveproxy pvedaemon
    echo "Plugin manager backup restored."
else
    echo "No plugin-manager backup found." >&2
    exit 1
fi
