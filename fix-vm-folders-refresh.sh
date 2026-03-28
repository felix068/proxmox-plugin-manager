#!/bin/bash
set -euo pipefail

TARGET="/usr/share/pve-manager/js/vm-folders-ui.js"
BACKUP_ROOT="/usr/share/pve-manager/plugin-backups/vm-folders-refresh"

if [ "${EUID:-$(id -u)}" -ne 0 ]; then
    echo "Run as root." >&2
    exit 1
fi

if [ ! -f "$TARGET" ]; then
    echo "Missing target: $TARGET" >&2
    exit 1
fi

if grep -q 'queueTreeRebuild' "$TARGET"; then
    echo "vm-folders refresh fix already present."
    exit 0
fi

BACKUP_DIR="$BACKUP_ROOT/$(date +%Y%m%d-%H%M%S)"
BACKUP_PATH="$BACKUP_DIR/usr/share/pve-manager/js/vm-folders-ui.js"
mkdir -p "$(dirname "$BACKUP_PATH")"
cp -a "$TARGET" "$BACKUP_PATH"

python3 - "$TARGET" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()

if 'queueTreeRebuild' in text:
    sys.exit(0)

old_vars = """  let folders = {};
  let editMode = false;
  let saveTimer = null;
  let activeDragVmId = null;
  let topEditButton = null;
"""

new_vars = """  let folders = {};
  let editMode = false;
  let saveTimer = null;
  let treeRebuildTimer = null;
  let treeRebuildPending = false;
  let resourceStoreLoaded = false;
  let activeDragVmId = null;
  let topEditButton = null;
"""

old_rebuild = """  function rebuildTreesFromStore() {
    const store = getResourceStore();
    if (!store) {
      return;
    }

    getTrees().forEach(function(tree) {
      try {
        if (typeof tree.clearTree === 'function') {
          tree.clearTree();
        }
      } catch (_error) {}
    });

    if (typeof store.fireEvent === 'function') {
      store.fireEvent('load', store);
    }

    getTrees().forEach(function(tree) {
      scheduleTreeWork(tree);
    });
  }
"""

new_helpers = """  function isResourceStoreLoaded() {
    const store = getResourceStore();
    if (!store) {
      return false;
    }

    if (typeof store.isLoaded === 'function') {
      return store.isLoaded();
    }

    if (typeof store.loadCount === 'number') {
      return store.loadCount > 0;
    }

    return resourceStoreLoaded;
  }

  function queueTreeRebuild(delayMs) {
    treeRebuildPending = true;

    if (treeRebuildTimer) {
      clearTimeout(treeRebuildTimer);
    }

    treeRebuildTimer = setTimeout(function() {
      treeRebuildTimer = null;

      if (!isResourceStoreLoaded()) {
        treeRebuildPending = true;
        return;
      }

      treeRebuildPending = false;
      rebuildTreesFromStore();
    }, delayMs || 50);
  }

  function flushQueuedTreeRebuild() {
    if (treeRebuildPending && isResourceStoreLoaded()) {
      queueTreeRebuild(30);
    }
  }
"""

old_apply = """  function applyStructuralChange(mutator) {
    mutator();
    sanitizeFolders();
    syncGlobalState();
    rebuildTreesFromStore();
    queueSave();
  }
"""

new_apply = """  function applyStructuralChange(mutator) {
    mutator();
    sanitizeFolders();
    syncGlobalState();
    queueTreeRebuild(50);
    queueSave();
  }
"""

old_load = """    store.on('load', function() {
      const changed = sanitizeFolders();
      syncGlobalState();
      if (changed) {
        queueSave();
      }
      getTrees().forEach(function(tree) {
        scheduleTreeWork(tree);
      });
    });
"""

new_load = """    store.on('load', function() {
      resourceStoreLoaded = true;
      const changed = sanitizeFolders();
      syncGlobalState();
      if (changed) {
        queueSave();
      }
      getTrees().forEach(function(tree) {
        scheduleTreeWork(tree);
      });
      flushQueuedTreeRebuild();
    });
"""

text = text.replace(old_vars, new_vars, 1)
if old_rebuild not in text:
    raise SystemExit('Could not find rebuildTreesFromStore block')
text = text.replace(old_rebuild, old_rebuild + "\n" + new_helpers, 1)
text = text.replace(old_apply, new_apply, 1)
text = text.replace(old_load, new_load, 1)
text = text.replace('rebuildTreesFromStore();', 'queueTreeRebuild(50);', 3)

if 'queueTreeRebuild' not in text:
    raise SystemExit('Patch failed to apply')

path.write_text(text)
PY

systemctl restart pveproxy

echo "Fixed vm-folders refresh bug. Refresh the browser."
