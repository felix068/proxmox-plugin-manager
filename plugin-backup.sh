#!/bin/bash

pm_backup_init() {
    if [ -n "${PM_BACKUP_DIR:-}" ]; then
        return 0
    fi

    : "${PM_PLUGIN_NAME:?}"
    : "${PM_BACKUP_ROOT:?}"

    local latest="$PM_BACKUP_ROOT/$PM_PLUGIN_NAME/latest"
    if [ -L "$latest" ]; then
        PM_BACKUP_DIR="$(readlink -f "$latest")"
        if [ -d "$PM_BACKUP_DIR" ]; then
            return 0
        fi
    fi

    PM_BACKUP_DIR="$PM_BACKUP_ROOT/$PM_PLUGIN_NAME/$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$PM_BACKUP_DIR"
    ln -sfn "$PM_BACKUP_DIR" "$latest"
}

pm_backup_file() {
    local path="$1"
    [ -e "$path" ] || return 0

    pm_backup_init

    local rel="${path#/}"
    local dest="$PM_BACKUP_DIR/$rel"
    mkdir -p "$(dirname "$dest")"
    cp -a "$path" "$dest"
}

pm_restore_latest_backup() {
    : "${PM_PLUGIN_NAME:?}"
    : "${PM_BACKUP_ROOT:?}"

    local latest="$PM_BACKUP_ROOT/$PM_PLUGIN_NAME/latest"
    local dir
    if [ -L "$latest" ]; then
        dir="$(readlink -f "$latest")"
    else
        dir="$(find "$PM_BACKUP_ROOT/$PM_PLUGIN_NAME" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort | tail -1 || true)"
    fi

    [ -n "$dir" ] || return 1
    [ -d "$dir" ] || return 1

    find "$dir" -mindepth 1 \( -type f -o -type l \) -print0 | while IFS= read -r -d '' src; do
        rel="${src#"$dir"/}"
        dest="/${rel}"
        mkdir -p "$(dirname "$dest")"
        cp -a "$src" "$dest"
    done
}
