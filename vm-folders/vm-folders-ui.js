(function() {
  'use strict';

  const LOG_PREFIX = '[VM-Folders]';
  const API_URL = '/api2/extjs/pluginmanager/folders';
  const FOLDER_PREFIX = 'folder-';
  const FOLDER_ICONS = [
    { value: 'fa-folder', text: 'Folder' },
    { value: 'fa-briefcase', text: 'Project' },
    { value: 'fa-archive', text: 'Archive' },
    { value: 'fa-cube', text: 'Infrastructure' },
    { value: 'fa-hdd-o', text: 'Storage' },
    { value: 'fa-database', text: 'Database' },
    { value: 'fa-cloud', text: 'Cloud' },
    { value: 'fa-server', text: 'Server' },
    { value: 'fa-star', text: 'Important' },
    { value: 'fa-bookmark', text: 'Bookmark' },
  ];

  let folders = {};
  let editMode = false;
  let saveTimer = null;
  let treeRebuildTimer = null;
  let treeRebuildPending = false;
  let resourceStoreLoaded = false;
  let activeDragVmId = null;
  let topEditButton = null;

  function log() {
    console.log.apply(console, [LOG_PREFIX].concat(Array.from(arguments)));
  }

  function warn() {
    console.warn.apply(console, [LOG_PREFIX].concat(Array.from(arguments)));
  }

  function ensureStyles() {
    if (document.getElementById('pve-vm-folders-styles')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'pve-vm-folders-styles';
    style.textContent = [
      '.pve-vm-folders-toolbar{position:sticky;top:0;z-index:4}',
      '.pve-vm-folders-toolbar button[style]{transition:opacity .15s ease, transform .15s ease}',
      '.pve-vm-folders-toolbar .pve-vm-folders-status{display:none}',
      '.pve-vm-folders-top-organize .x-btn-inner{font-size:11px}',
      '.pve-vm-folders-edit-mode .x-grid-item-container .x-grid-row{transition:background-color .15s ease, box-shadow .15s ease, border-color .15s ease, opacity .15s ease}',
      '.pve-vm-folders-edit-mode .pve-vm-folders-draggable .x-grid-row,.pve-vm-folders-edit-mode .pve-vm-folders-draggable.x-grid-row{box-shadow:inset 3px 0 0 rgba(43,121,180,.95);background-image:linear-gradient(90deg, rgba(43,121,180,.10), rgba(43,121,180,0));cursor:grab}',
      '.pve-vm-folders-edit-mode .pve-vm-folders-draggable .x-tree-node-text,.pve-vm-folders-edit-mode .pve-vm-folders-draggable.x-grid-row .x-tree-node-text{font-weight:600}',
      '.pve-vm-folders-edit-mode .pve-vm-folders-dropzone .x-grid-row,.pve-vm-folders-edit-mode .pve-vm-folders-dropzone.x-grid-row{box-shadow:inset 0 0 0 1px rgba(210,155,44,.55);background-image:linear-gradient(90deg, rgba(210,155,44,.12), rgba(210,155,44,.04))}',
      '.pve-vm-folders-edit-mode .pve-vm-folders-dropzone .x-tree-node-text,.pve-vm-folders-edit-mode .pve-vm-folders-dropzone.x-grid-row .x-tree-node-text{font-weight:600}',
      '.pve-vm-folders-edit-mode .pve-vm-folders-dropzone.is-hover .x-grid-row,.pve-vm-folders-edit-mode .pve-vm-folders-dropzone.is-hover.x-grid-row{box-shadow:inset 0 0 0 2px rgba(62,140,201,.9);background-image:linear-gradient(90deg, rgba(62,140,201,.20), rgba(62,140,201,.08))}',
      '.pve-vm-folders-edit-mode .pve-vm-folders-folder-blocked .x-grid-row,.pve-vm-folders-edit-mode .pve-vm-folders-folder-blocked.x-grid-row{opacity:.62;filter:saturate(.7)}',
    ].join('');
    document.head.appendChild(style);
  }

  function getTrees() {
    if (typeof Ext === 'undefined' || !Ext.ComponentQuery) {
      return [];
    }
    return Ext.ComponentQuery.query('pveResourceTree');
  }

  function getResourceStore() {
    return PVE && PVE.data ? PVE.data.ResourceStore : null;
  }

  function getResourceItems() {
    const store = getResourceStore();
    const data = store && typeof store.getData === 'function' ? store.getData() : null;
    return data && data.items ? data.items : [];
  }

  function buildVmMap() {
    const map = {};
    getResourceItems().forEach(function(item) {
      const data = item && item.data;
      if (!data || !data.vmid) {
        return;
      }
      if (data.type !== 'qemu' && data.type !== 'lxc') {
        return;
      }
      map[String(data.vmid)] = data;
    });
    return map;
  }

  function getNodeNames() {
    const names = new Set();
    getResourceItems().forEach(function(item) {
      const data = item && item.data;
      if (!data || data.type !== 'node') {
        return;
      }
      if (data.node) {
        names.add(data.node);
      }
    });
    return Array.from(names).sort(function(a, b) {
      return a.localeCompare(b);
    });
  }

  function isGuestInfo(info) {
    return !!info && !!info.vmid && (info.type === 'qemu' || info.type === 'lxc');
  }

  function isFolderId(value) {
    return typeof value === 'string' && value.startsWith(FOLDER_PREFIX);
  }

  function isFolderRecord(record) {
    return !!record && isFolderId(record.data && record.data.id);
  }

  function isServerView(tree) {
    if (!tree || !tree.viewFilter) {
      return true;
    }
    return tree.viewFilter.id === 'server';
  }

  function normalizeFolderIcon(icon) {
    const value = String(icon || 'fa-folder').trim();
    return value.startsWith('fa-') ? value : 'fa-folder';
  }

  function getFolderIconCls(folder) {
    const baseIcon = normalizeFolderIcon(folder && folder.icon);
    if (baseIcon === 'fa-folder') {
      return folder && folder.collapsed ? 'fa fa-folder' : 'fa fa-folder-open';
    }
    return 'fa ' + baseIcon;
  }

  function getFolderIconLabel(icon) {
    const normalized = normalizeFolderIcon(icon);
    const match = FOLDER_ICONS.find(function(entry) {
      return entry.value === normalized;
    });
    return match ? match.text : 'Folder';
  }

  function normalizeFolder(id, folder) {
    const vmMap = buildVmMap();
    const hasVmData = Object.keys(vmMap).length > 0;
    const items = Array.from(new Set((folder.items || []).map(function(item) {
      return String(item);
    })));
    let node = folder.node ? String(folder.node) : '';

    if (!node && items.length > 0) {
      const firstVm = vmMap[items[0]];
      if (firstVm && firstVm.node) {
        node = String(firstVm.node);
      }
    }

    const normalizedItems = !hasVmData ? items : items.filter(function(vmid) {
      const vm = vmMap[vmid];
      if (!vm) {
        return false;
      }
      if (!node) {
        return true;
      }
      return vm.node === node;
    });

    return {
      id: id,
      name: String(folder.name || 'Folder'),
      node: node,
      items: normalizedItems,
      icon: normalizeFolderIcon(folder.icon),
      collapsed: !!folder.collapsed,
    };
  }

  function normalizeFolders(raw) {
    const normalized = {};
    Object.entries(raw || {}).forEach(function(entry) {
      const id = entry[0];
      const folder = entry[1] || {};
      normalized[id] = normalizeFolder(id, folder);
    });
    return normalized;
  }

  function sanitizeFolders() {
    const vmMap = buildVmMap();
    if (Object.keys(vmMap).length === 0) {
      return false;
    }
    let changed = false;

    Object.keys(folders).forEach(function(folderId) {
      const folder = folders[folderId];
      if (!folder) {
        return;
      }

      if (!folder.node && folder.items.length > 0) {
        const firstVm = vmMap[folder.items[0]];
        if (firstVm && firstVm.node) {
          folder.node = String(firstVm.node);
          changed = true;
        }
      }

      const uniqueItems = [];
      const seen = new Set();
      folder.items.forEach(function(vmid) {
        const vmId = String(vmid);
        const vm = vmMap[vmId];
        if (!vm) {
          changed = true;
          return;
        }
        if (folder.node && vm.node !== folder.node) {
          changed = true;
          return;
        }
        if (seen.has(vmId)) {
          changed = true;
          return;
        }
        seen.add(vmId);
        uniqueItems.push(vmId);
      });

      if (uniqueItems.length !== folder.items.length) {
        changed = true;
      }
      folder.items = uniqueItems;
    });

    return changed;
  }

  function syncGlobalState() {
    if (!window.PVEVmFolders) {
      return;
    }
    window.PVEVmFolders.folders = folders;
  }

  function apiRequest(config) {
    Proxmox.Utils.API2Request(config);
  }

  function queueSave() {
    if (saveTimer) {
      clearTimeout(saveTimer);
    }
    saveTimer = setTimeout(function() {
      apiRequest({
        url: API_URL,
        method: 'PUT',
        params: { data: JSON.stringify(folders) },
        success: function() {
          log('Saved folders:', Object.keys(folders).length);
        },
        failure: function(response) {
          warn('Save failed:', response);
        },
      });
    }, 200);
  }

  function loadFolders(callback) {
    apiRequest({
      url: API_URL,
      method: 'GET',
      success: function(response) {
        folders = normalizeFolders(response.result.data || {});
        const changed = sanitizeFolders();
        syncGlobalState();
        if (changed) {
          queueSave();
        }
        log('Loaded folders:', Object.keys(folders).length);
        if (callback) {
          callback();
        }
      },
      failure: function(response) {
        warn('Load failed, using empty state:', response);
        folders = {};
        syncGlobalState();
        if (callback) {
          callback();
        }
      },
    });
  }

  function getFolderForVm(vmId) {
    const vmIdString = String(vmId);
    for (const folderId in folders) {
      const folder = folders[folderId];
      if (folder.items.indexOf(vmIdString) !== -1) {
        return folderId;
      }
    }
    return null;
  }

  function getFolderCount(folder) {
    const vmMap = buildVmMap();
    return folder.items.filter(function(vmid) {
      const vm = vmMap[vmid];
      if (!vm) {
        return false;
      }
      if (!folder.node) {
        return true;
      }
      return vm.node === folder.node;
    }).length;
  }

  function buildFolderText(folder) {
    return folder.name + ' (' + getFolderCount(folder) + ')';
  }

  function compareFolders(folderIdA, folderIdB) {
    const nameA = folders[folderIdA] ? folders[folderIdA].name : folderIdA;
    const nameB = folders[folderIdB] ? folders[folderIdB].name : folderIdB;
    const compare = nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
    return compare !== 0 ? compare : folderIdA.localeCompare(folderIdB);
  }

  function getFoldersForNode(nodeName) {
    return Object.keys(folders)
      .filter(function(folderId) {
        return folders[folderId].node === nodeName;
      })
      .sort(compareFolders);
  }

  function findRootNode(node) {
    let current = node;
    while (current && current.parentNode) {
      current = current.parentNode;
    }
    return current;
  }

  function findNodeById(tree, nodeId) {
    const root = tree && tree.store && tree.store.getRootNode ? tree.store.getRootNode() : null;
    return root ? root.findChild('id', nodeId, true) : null;
  }

  function collectFolderNodes(node, out) {
    (node.childNodes || []).forEach(function(child) {
      if (isFolderId(child.data && child.data.id)) {
        out.push(child);
      }
      collectFolderNodes(child, out);
    });
  }

  function buildFolderNodeInfo(folderId, folder) {
    return {
      id: folderId,
      type: 'folder',
      node: folder.node,
      folderName: folder.name,
      text: buildFolderText(folder),
      iconCls: getFolderIconCls(folder),
      leaf: false,
      expanded: !folder.collapsed,
    };
  }

  function updateFolderNodeVisuals(folderNode, folder) {
    if (!folderNode || !folder) {
      return;
    }

    folderNode.beginEdit();
    folderNode.set('folderName', folder.name);
    folderNode.set('node', folder.node);
    folderNode.set('text', buildFolderText(folder));
    folderNode.set('iconCls', getFolderIconCls(folder));
    folderNode.set('leaf', false);
    folderNode.commit();

    if (folder.collapsed && folderNode.isExpanded && folderNode.isExpanded()) {
      folderNode.collapse(false, false);
    } else if (!folder.collapsed && folderNode.expand && !folderNode.isExpanded()) {
      folderNode.expand(false, false);
    }
  }

  function ensureNodeGroup(tree, rootNode, nodeName, nodeInfo) {
    if (!rootNode || !nodeName) {
      return null;
    }

    let nodeGroup = rootNode.findChild('groupbyid', nodeName, false);
    if (!nodeGroup) {
      const groupInfo = nodeInfo ? Ext.apply({}, nodeInfo) : {
        type: 'node',
        id: 'node/' + nodeName,
        node: nodeName,
        text: nodeName,
        iconCls: 'fa fa-building',
      };
      groupInfo.leaf = false;
      groupInfo.groupbyid = nodeName;
      groupInfo.expanded = true;
      nodeGroup = tree.addChildSorted(rootNode, groupInfo);
      return nodeGroup;
    }

    if (nodeInfo) {
      const wasExpanded = nodeGroup.isExpanded ? nodeGroup.isExpanded() : true;
      nodeGroup.beginEdit();
      Object.keys(nodeInfo).forEach(function(key) {
        if (key === 'groupbyid') {
          return;
        }
        nodeGroup.set(key, nodeInfo[key]);
      });
      nodeGroup.set('groupbyid', nodeName);
      nodeGroup.set('leaf', false);
      nodeGroup.commit();
      if (wasExpanded && nodeGroup.expand) {
        nodeGroup.expand(false, false);
      }
    }

    return nodeGroup;
  }

  function ensureFolderNode(tree, rootNode, folderId) {
    const folder = folders[folderId];
    if (!folder || !folder.node) {
      return null;
    }

    const nodeGroup = ensureNodeGroup(tree, rootNode, folder.node);
    if (!nodeGroup) {
      return null;
    }

    let folderNode = rootNode.findChild('id', folderId, true);
    if (folderNode && folderNode.parentNode !== nodeGroup) {
      folderNode.parentNode.removeChild(folderNode, false);
      folderNode = null;
    }

    if (!folderNode) {
      folderNode = tree.addChildSorted(nodeGroup, buildFolderNodeInfo(folderId, folder));
    }

    updateFolderNodeVisuals(folderNode, folder);
    return folderNode;
  }

  function removeStaleFolderNodes(tree) {
    const rootNode = tree && tree.store && tree.store.getRootNode ? tree.store.getRootNode() : null;
    if (!rootNode) {
      return;
    }

    const folderNodes = [];
    collectFolderNodes(rootNode, folderNodes);
    folderNodes.forEach(function(folderNode) {
      const folder = folders[folderNode.data.id];
      const parentNode = folderNode.parentNode;
      const validParent = !!folder && !!parentNode && parentNode.data && parentNode.data.type === 'node' && parentNode.data.groupbyid === folder.node;
      if (!validParent && parentNode) {
        parentNode.removeChild(folderNode, true);
      }
    });
  }

  function syncFolderNodes(tree) {
    if (!tree || !tree.store || !tree.store.getRootNode) {
      return;
    }

    const rootNode = tree.store.getRootNode();
    if (!rootNode) {
      return;
    }

    removeStaleFolderNodes(tree);

    if (!isServerView(tree)) {
      setupDragDrop(tree);
      ensureToolbar(tree);
      return;
    }

    Object.keys(folders).sort(compareFolders).forEach(function(folderId) {
      ensureFolderNode(tree, rootNode, folderId);
    });

    setupDragDrop(tree);
    ensureToolbar(tree);
    expandServerNodes(tree);
  }

  function expandServerNodes(tree) {
    if (!tree || !tree.store || !tree.store.getRootNode) {
      return;
    }

    const rootNode = tree.store.getRootNode();
    if (!rootNode) {
      return;
    }

    if (rootNode.expand && !rootNode.isExpanded()) {
      rootNode.expand(false, false);
    }

    (rootNode.childNodes || []).forEach(function(child) {
      if (!child || !child.data) {
        return;
      }
      if (child.data.type === 'node' && child.expand && !child.isExpanded()) {
        child.expand(false, false);
      }
    });
  }

  function scheduleTreeWork(tree) {
    if (!tree) {
      return;
    }
    if (tree.__vmFoldersTimer) {
      clearTimeout(tree.__vmFoldersTimer);
    }
    tree.__vmFoldersTimer = setTimeout(function() {
      syncFolderNodes(tree);
    }, 30);
  }

  function getViewSelector() {
    if (typeof Ext === 'undefined') {
      return null;
    }

    if (Ext.getCmp) {
      const byId = Ext.getCmp('view');
      if (byId) {
        return byId;
      }
    }

    if (Ext.ComponentQuery) {
      const matches = Ext.ComponentQuery.query('pveViewSelector');
      if (matches && matches.length > 0) {
        return matches[0];
      }
    }

    return null;
  }

  function isServerViewSelector() {
    const selector = getViewSelector();
    if (!selector || typeof selector.getViewFilter !== 'function') {
      return true;
    }

    const filter = selector.getViewFilter();
    return !filter || filter.id === 'server';
  }

  function refreshTopEditButton() {
    if (!topEditButton || topEditButton.destroyed) {
      return false;
    }

    const serverView = isServerViewSelector();
    topEditButton.setText(editMode ? gettext('Done') : gettext('Organize'));
    topEditButton.setIconCls(editMode ? 'fa fa-fw fa-check' : 'fa fa-fw fa-edit');
    topEditButton.setDisabled(!serverView);
    return true;
  }

  function bindTopEditButton(selector) {
    if (!selector || selector.__vmFoldersTopBound) {
      return;
    }

    selector.__vmFoldersTopBound = true;
    selector.on('select', function() {
      refreshTopEditButton();
    });
  }

  function ensureTopEditButton() {
    const selector = getViewSelector();
    if (!selector || !selector.ownerCt) {
      return false;
    }

    bindTopEditButton(selector);

    const container = selector.ownerCt;
    if (topEditButton && !topEditButton.destroyed && topEditButton.ownerCt === container) {
      refreshTopEditButton();
      return true;
    }

    if (topEditButton && !topEditButton.destroyed) {
      topEditButton.destroy();
      topEditButton = null;
    }

    topEditButton = Ext.create('Ext.button.Button', {
      cls: 'x-btn-default-toolbar-small pve-vm-folders-top-organize',
      margin: '0 4 0 4',
      iconCls: 'fa fa-fw fa-edit',
      text: gettext('Organize'),
      handler: function() {
        if (!isServerViewSelector()) {
          return;
        }
        editMode = !editMode;
        refreshTopEditButton();
        getTrees().forEach(function(tree) {
          scheduleTreeWork(tree);
        });
      },
    });

    container.insert(1, topEditButton);
    refreshTopEditButton();
    return true;
  }

  function ensureTopEditButtonLater() {
    if (!ensureTopEditButton()) {
      setTimeout(ensureTopEditButtonLater, 100);
    }
  }

  function rebuildTreesFromStore() {
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

  function isResourceStoreLoaded() {
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

  function applyStructuralChange(mutator) {
    mutator();
    sanitizeFolders();
    syncGlobalState();
    queueTreeRebuild(50);
    queueSave();
  }

  function setFolderCollapsed(folderId, collapsed, syncNode) {
    const folder = folders[folderId];
    if (!folder || folder.collapsed === collapsed) {
      return;
    }

    folder.collapsed = collapsed;
    syncGlobalState();

    getTrees().forEach(function(tree) {
      const folderNode = findNodeById(tree, folderId);
      if (!folderNode) {
        return;
      }
      updateFolderNodeVisuals(folderNode, folder);
      if (syncNode !== false) {
        if (collapsed && folderNode.collapse) {
          folderNode.collapse(false, false);
        } else if (!collapsed && folderNode.expand) {
          folderNode.expand(false, false);
        }
      }
    });

    queueSave();
  }

  function createFolder(name, nodeName, icon) {
    const trimmedName = String(name || '').trim();
    const trimmedNode = String(nodeName || '').trim();
    if (!trimmedName || !trimmedNode) {
      return null;
    }

    const folderId = FOLDER_PREFIX + trimmedNode + '-' + Date.now();
    applyStructuralChange(function() {
      folders[folderId] = {
        id: folderId,
        name: trimmedName,
        node: trimmedNode,
        items: [],
        icon: normalizeFolderIcon(icon),
        collapsed: false,
      };
    });
    return folderId;
  }

  function updateFolder(folderId, updates) {
    const folder = folders[folderId];
    if (!folder) {
      return;
    }

    const nextName = String(updates && updates.name || '').trim();
    if (!nextName) {
      return;
    }

    folder.name = nextName;
    folder.icon = normalizeFolderIcon(updates && updates.icon || folder.icon);
    syncGlobalState();
    getTrees().forEach(function(tree) {
      const folderNode = findNodeById(tree, folderId);
      if (folderNode) {
        updateFolderNodeVisuals(folderNode, folder);
      }
    });
    queueSave();
  }

  function renameFolder(folderId, name) {
    updateFolder(folderId, { name: name });
  }

  function removeFolder(folderId) {
    if (!folders[folderId]) {
      return;
    }

    applyStructuralChange(function() {
      delete folders[folderId];
    });
  }

  function addVmToFolder(vmId, folderId) {
    const folder = folders[folderId];
    const vmMap = buildVmMap();
    const vm = vmMap[String(vmId)];
    if (!folder || !vm || !folder.node || vm.node !== folder.node) {
      return false;
    }

    applyStructuralChange(function() {
      const vmIdString = String(vmId);
      Object.keys(folders).forEach(function(id) {
        folders[id].items = folders[id].items.filter(function(item) {
          return item !== vmIdString;
        });
      });
      if (folder.items.indexOf(vmIdString) === -1) {
        folder.items.push(vmIdString);
      }
    });

    return true;
  }

  function removeVmFromFolder(vmId, folderId) {
    const folder = folders[folderId];
    if (!folder) {
      return;
    }

    applyStructuralChange(function() {
      const vmIdString = String(vmId);
      folder.items = folder.items.filter(function(item) {
        return item !== vmIdString;
      });
    });
  }

  function getThemeColors() {
    const body = document.body;
    const html = document.documentElement;
    const dark = body.classList.contains('x-theme-dark') ||
      html.classList.contains('x-theme-dark') ||
      body.classList.contains('dark') ||
      (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);

    return {
      toolbarBg: dark ? '#2b2b2b' : '#f5f5f5',
      toolbarBorder: dark ? '#404040' : '#d0d0d0',
      buttonBg: dark ? '#404040' : '#ffffff',
      buttonText: dark ? '#eeeeee' : '#000000',
      buttonBorder: dark ? '#555555' : '#d0d0d0',
      buttonActive: dark ? '#456170' : '#c2ddf2',
      dropBg: dark ? '#334956' : '#d7ebfb',
    };
  }

  function getDefaultNode(tree) {
    const selected = tree && tree.getSelectionModel ? tree.getSelectionModel().getSelection()[0] : null;
    if (selected && selected.data) {
      if (selected.data.type === 'node' && selected.data.node) {
        return selected.data.node;
      }
      if (selected.data.node) {
        return selected.data.node;
      }
    }
    return getNodeNames()[0] || '';
  }

  function openFolderDialog(options) {
    const tree = options.tree;
    const folder = options.folder || null;
    const defaultNode = options.defaultNode || '';
    const onSubmit = options.onSubmit;

    if (!isServerView(tree)) {
      Ext.Msg.alert('VM Folders', 'Folders are only available in Server View.');
      return;
    }

    const nodeNames = getNodeNames();
    if (!nodeNames.length) {
      Ext.Msg.alert('VM Folders', 'No Proxmox nodes were detected.');
      return;
    }

    const nodeStore = Ext.create('Ext.data.Store', {
      fields: ['value', 'text'],
      data: nodeNames.map(function(nodeName) {
        return { value: nodeName, text: nodeName };
      }),
    });

    const iconStore = Ext.create('Ext.data.Store', {
      fields: ['value', 'text'],
      data: FOLDER_ICONS,
    });

    const form = Ext.create('Ext.form.Panel', {
      bodyPadding: 12,
      border: false,
      defaults: {
        anchor: '100%',
        allowBlank: false,
      },
      items: [{
        xtype: 'textfield',
        fieldLabel: 'Name',
        name: 'name',
        value: folder ? folder.name : '',
      }, {
        xtype: 'combo',
        fieldLabel: 'Server',
        name: 'node',
        editable: false,
        queryMode: 'local',
        forceSelection: true,
        store: nodeStore,
        displayField: 'text',
        valueField: 'value',
        value: folder && folder.node ? folder.node : (defaultNode && nodeNames.indexOf(defaultNode) !== -1 ? defaultNode : nodeNames[0]),
        disabled: !!folder,
      }, {
        xtype: 'combo',
        fieldLabel: 'Icon',
        name: 'icon',
        editable: false,
        queryMode: 'local',
        forceSelection: true,
        store: iconStore,
        displayField: 'text',
        valueField: 'value',
        value: folder ? normalizeFolderIcon(folder.icon) : 'fa-folder',
      }],
    });

    const win = Ext.create('Ext.window.Window', {
      title: folder ? 'Edit Folder' : 'New Folder',
      modal: true,
      width: 360,
      layout: 'fit',
      items: [form],
      buttons: [{
        text: 'Cancel',
        handler: function() {
          win.close();
        },
      }, {
        text: folder ? 'Save' : 'Create',
        handler: function() {
          const values = form.getValues();
          if (folder) {
            updateFolder(folder.id, values);
            win.close();
            if (onSubmit) {
              onSubmit(folder.id, values);
            }
            return;
          }

          const folderId = createFolder(values.name, values.node, values.icon);
          if (!folderId) {
            return;
          }
          win.close();
          if (onSubmit) {
            onSubmit(folderId, values);
          }
        },
      }],
    });

    win.show();
  }

  function openCreateFolderDialog(tree, defaultNode, onCreate) {
    openFolderDialog({
      tree: tree,
      defaultNode: defaultNode,
      onSubmit: onCreate,
    });
  }

  function openEditFolderDialog(tree, folderId) {
    const folder = folders[folderId];
    if (!folder) {
      return;
    }

    openFolderDialog({
      tree: tree,
      folder: folder,
    });
  }

  function ensureToolbar(tree) {
    if (!tree || !tree.rendered) {
      return;
    }

    const bodyWrap = tree.getEl() && tree.getEl().dom.querySelector('[data-ref="bodyWrap"]');
    if (!bodyWrap) {
      return;
    }

    const colors = getThemeColors();
    const serverView = isServerView(tree);
    let toolbar = bodyWrap.querySelector('.pve-vm-folders-toolbar');

    if (!toolbar) {
      toolbar = document.createElement('div');
      toolbar.className = 'pve-vm-folders-toolbar';
      toolbar.style.cssText = 'display:flex;gap:6px;padding:6px 8px;align-items:center;';

      const newButton = document.createElement('button');
      newButton.className = 'pve-vm-folders-new';
      newButton.innerHTML = '<i class="fa fa-folder-plus"></i> Folder';
      newButton.onclick = function() {
        openCreateFolderDialog(tree, getDefaultNode(tree));
      };

      [newButton].forEach(function(button) {
        button.style.cssText = 'padding:4px 8px;border-radius:3px;cursor:pointer;font-size:11px;';
        toolbar.appendChild(button);
      });

      const status = document.createElement('div');
      status.className = 'pve-vm-folders-status';
      toolbar.appendChild(status);

      bodyWrap.insertBefore(toolbar, bodyWrap.firstChild);
    }

    toolbar.style.background = colors.toolbarBg;
    toolbar.style.borderBottom = '1px solid ' + colors.toolbarBorder;

    const newButton = toolbar.querySelector('.pve-vm-folders-new');
    const status = toolbar.querySelector('.pve-vm-folders-status');

    if (newButton) {
      newButton.disabled = !serverView;
      newButton.style.background = colors.buttonBg;
      newButton.style.color = colors.buttonText;
      newButton.style.border = '1px solid ' + colors.buttonBorder;
      newButton.style.opacity = serverView && editMode ? '1' : '0';
      newButton.style.display = serverView && editMode ? '' : 'none';
    }

    if (status) {
      status.className = 'pve-vm-folders-status';
      status.textContent = '';
    }
  }

  function updateEditModePresentation(tree, nodeEl, row, record, colors) {
    const treeEl = tree && tree.getEl ? tree.getEl() : null;
    if (treeEl) {
      treeEl.toggleCls('pve-vm-folders-edit-mode', !!(editMode && isServerView(tree)));
    }

    if (!nodeEl || !row) {
      return;
    }

    nodeEl.classList.remove('pve-vm-folders-draggable', 'pve-vm-folders-dropzone', 'pve-vm-folders-folder-blocked', 'is-hover');
    row.classList.remove('pve-vm-folders-draggable', 'pve-vm-folders-dropzone', 'pve-vm-folders-folder-blocked', 'is-hover');
    row.style.background = '';
    row.style.boxShadow = '';
    row.style.borderLeft = '';
    row.style.opacity = '';

    if (!editMode || !isServerView(tree) || !record || !record.data) {
      nodeEl.removeAttribute('title');
      return;
    }

    if (isGuestInfo(record.data)) {
      nodeEl.classList.add('pve-vm-folders-draggable');
      row.classList.add('pve-vm-folders-draggable');
      row.style.background = 'linear-gradient(90deg, rgba(43,121,180,.12), rgba(43,121,180,0))';
      row.style.borderLeft = '3px solid rgba(43,121,180,.95)';
      nodeEl.removeAttribute('title');
      return;
    }

    if (isFolderRecord(record)) {
      const folder = folders[record.data.id];
      const selected = tree.getSelectionModel ? tree.getSelectionModel().getSelection()[0] : null;
      const selectedNode = selected && selected.data && selected.data.node ? selected.data.node : '';
      const blocked = selectedNode && folder && folder.node && selectedNode !== folder.node && !!selected.data.vmid;

      nodeEl.classList.add(blocked ? 'pve-vm-folders-folder-blocked' : 'pve-vm-folders-dropzone');
      row.classList.add(blocked ? 'pve-vm-folders-folder-blocked' : 'pve-vm-folders-dropzone');
      row.style.background = blocked
        ? 'linear-gradient(90deg, rgba(120,132,145,.12), rgba(120,132,145,0))'
        : 'linear-gradient(90deg, rgba(210,155,44,.14), rgba(210,155,44,.04))';
      row.style.borderLeft = blocked
        ? '3px solid rgba(120,132,145,.75)'
        : '3px solid rgba(210,155,44,.9)';
      row.style.opacity = blocked ? '0.62' : '1';
      nodeEl.removeAttribute('title');
      return;
    }

    nodeEl.removeAttribute('title');
  }

  function showFolderMenu(tree, folderId, event) {
    const folder = folders[folderId];
    if (!folder) {
      return false;
    }

    Ext.create('Ext.menu.Menu', {
      items: [{
        text: 'Edit',
        iconCls: 'fa fa-pencil',
        handler: function() {
          openEditFolderDialog(tree, folderId);
        },
      }, {
        text: 'Delete',
        iconCls: 'fa fa-trash',
        handler: function() {
          Ext.Msg.confirm('Delete Folder', 'Delete "' + folder.name + '" on ' + folder.node + '?', function(button) {
            if (button === 'yes') {
              removeFolder(folderId);
            }
          });
        },
      }],
    }).showAt(event.getXY());

    return false;
  }

  function showVmMenu(tree, record, event) {
    if (!editMode || !isServerView(tree) || !record || !record.data || !record.data.vmid || !record.data.node) {
      return true;
    }

    const vmId = String(record.data.vmid);
    const nodeName = record.data.node;
    const nodeFolderIds = getFoldersForNode(nodeName);
    const currentFolder = getFolderForVm(vmId);
    const menuItems = [];

    if (nodeFolderIds.length > 0) {
      menuItems.push({
        text: 'Move To Folder',
        iconCls: 'fa fa-folder-open',
        menu: {
          items: nodeFolderIds.map(function(folderId) {
            return {
              text: folders[folderId].name,
                iconCls: 'fa fa-folder',
                handler: function() {
                  addVmToFolder(vmId, folderId);
                },
              };
          }),
        },
      });
    }

    menuItems.push({
      text: 'New Folder On ' + nodeName,
      iconCls: 'fa fa-folder-plus',
      handler: function() {
        openCreateFolderDialog(tree, nodeName, function(folderId) {
          addVmToFolder(vmId, folderId);
        });
      },
    });

    if (currentFolder) {
      menuItems.push('-');
      menuItems.push({
        text: 'Remove From Folder',
        iconCls: 'fa fa-times',
        handler: function() {
          removeVmFromFolder(vmId, currentFolder);
        },
      });
    }

    Ext.create('Ext.menu.Menu', {
      items: menuItems,
    }).showAt(event.getXY());

    return false;
  }

  function getVmInfo(vmId) {
    return buildVmMap()[String(vmId)] || null;
  }

  function setupDragDrop(tree) {
    const view = tree && tree.getView && tree.getView();
    if (!view || typeof view.getNodes !== 'function') {
      return;
    }

    const bodyWrap = tree.getEl() && tree.getEl().dom.querySelector('[data-ref="bodyWrap"]');
    if (bodyWrap && !bodyWrap.__vmFoldersDropBound) {
      bodyWrap.__vmFoldersDropBound = true;
      bodyWrap.ondragover = function(event) {
        if (!editMode || !isServerView(tree) || !activeDragVmId) {
          return;
        }
        if (!getFolderForVm(activeDragVmId)) {
          return;
        }
        if (event.target.closest('.pve-vm-folders-dropzone')) {
          return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      };
      bodyWrap.ondrop = function(event) {
        if (!editMode || !isServerView(tree)) {
          return;
        }
        if (event.target.closest('.pve-vm-folders-dropzone')) {
          return;
        }
        const vmId = activeDragVmId || event.dataTransfer.getData('text/plain');
        const currentFolder = vmId ? getFolderForVm(vmId) : null;
        if (!currentFolder) {
          return;
        }
        event.preventDefault();
        removeVmFromFolder(vmId, currentFolder);
      };
    }

    const colors = getThemeColors();
    view.getNodes().forEach(function(nodeEl) {
      const record = view.getRecord(nodeEl);
      const row = nodeEl.querySelector('.x-grid-row');
      if (!record || !row) {
        return;
      }

      nodeEl.draggable = false;
      nodeEl.style.cursor = '';
      nodeEl.ondragstart = null;
      nodeEl.ondragend = null;
      nodeEl.ondragover = null;
      nodeEl.ondragleave = null;
      nodeEl.ondrop = null;
      updateEditModePresentation(tree, nodeEl, row, record, colors);

      if (!editMode || !isServerView(tree)) {
        return;
      }

      if (isGuestInfo(record.data)) {
        nodeEl.draggable = true;
        nodeEl.style.cursor = 'grab';
        nodeEl.ondragstart = function(event) {
          activeDragVmId = String(record.data.vmid);
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', activeDragVmId);
          nodeEl.style.opacity = '0.5';
        };
        nodeEl.ondragend = function() {
          activeDragVmId = null;
          nodeEl.style.opacity = '1';
        };
      }

      if (isFolderRecord(record)) {
        const folder = folders[record.data.id];
        if (!folder) {
          return;
        }

        nodeEl.ondragover = function(event) {
          const vmId = event.dataTransfer.getData('text/plain');
          const vm = getVmInfo(vmId);
          if (!vm || vm.node !== folder.node) {
            return;
          }
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          row.style.background = colors.dropBg;
          row.classList.add('is-hover');
          nodeEl.classList.add('is-hover');
        };
        nodeEl.ondragleave = function() {
          row.style.background = '';
          row.classList.remove('is-hover');
          nodeEl.classList.remove('is-hover');
        };
        nodeEl.ondrop = function(event) {
          event.preventDefault();
          row.style.background = '';
          row.classList.remove('is-hover');
          nodeEl.classList.remove('is-hover');
          const vmId = event.dataTransfer.getData('text/plain');
          addVmToFolder(vmId, record.data.id);
        };
      }
    });
  }

  function bindTree(tree) {
    if (!tree) {
      return;
    }

    if (tree.__vmFoldersBound) {
      scheduleTreeWork(tree);
      return;
    }
    tree.__vmFoldersBound = true;

    tree.on('beforeselect', function(_sm, record) {
      return !isFolderRecord(record);
    });

    tree.on('itemclick', function(_view, record, _item, _index, event) {
      if (!isFolderRecord(record)) {
        return true;
      }

      if (event.getTarget('.x-tree-expander')) {
        return false;
      }

      event.stopEvent();
      if (record.isExpanded && record.isExpanded()) {
        record.collapse(false, false);
        setFolderCollapsed(record.data.id, true, false);
      } else if (record.expand) {
        record.expand(false, false);
        setFolderCollapsed(record.data.id, false, false);
      }
      return false;
    });

    tree.on('itemcollapse', function(record) {
      if (isFolderRecord(record)) {
        setFolderCollapsed(record.data.id, true, false);
      }
      scheduleTreeWork(tree);
    });

    tree.on('itemexpand', function(record) {
      if (isFolderRecord(record)) {
        setFolderCollapsed(record.data.id, false, false);
      }
      scheduleTreeWork(tree);
    });

    tree.on('itemcontextmenu', function(_view, record, _item, _index, event) {
      if (isFolderRecord(record)) {
        event.stopEvent();
        return showFolderMenu(tree, record.data.id, event);
      }

      if (isGuestInfo(record && record.data) && editMode && isServerView(tree)) {
        event.stopEvent();
        return showVmMenu(tree, record, event);
      }

      return true;
    });

    if (tree.store) {
      tree.store.on('refresh', function() {
        scheduleTreeWork(tree);
      });
    }

    if (tree.rendered) {
      scheduleTreeWork(tree);
    } else {
      tree.on('afterrender', function() {
        scheduleTreeWork(tree);
      }, null, { single: true });
    }
  }

  function bindResourceStore() {
    const store = getResourceStore();
    if (!store || store.__vmFoldersBound) {
      return;
    }
    store.__vmFoldersBound = true;

    store.on('load', function() {
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
  }

  function installTreePatch() {
    if (!PVE || !PVE.tree || !PVE.tree.ResourceTree) {
      return false;
    }

    const ResourceTree = PVE.tree.ResourceTree;
    ResourceTree.typeDefaults.folder = {
      iconCls: 'fa fa-folder',
      text: 'Folder',
    };

    const prototype = ResourceTree.prototype;
    if (prototype.__vmFoldersPatched) {
      getTrees().forEach(bindTree);
      return true;
    }
    prototype.__vmFoldersPatched = true;

    const originalGetTypeOrder = prototype.getTypeOrder;
    prototype.getTypeOrder = function(type) {
      if (type === 'folder') {
        return -1;
      }
      return originalGetTypeOrder.call(this, type);
    };

    const originalNodeSortFn = prototype.nodeSortFn;
    prototype.nodeSortFn = function(node1, node2) {
      const data1 = node1 && node1.data ? node1.data : {};
      const data2 = node2 && node2.data ? node2.data : {};
      if (data1.type === 'folder' && data2.type === 'folder') {
        const name1 = String(data1.folderName || data1.text || '');
        const name2 = String(data2.folderName || data2.text || '');
        return name1.localeCompare(name2, undefined, { sensitivity: 'base' });
      }
      return originalNodeSortFn.call(this, node1, node2);
    };

    const originalGroupChild = prototype.groupChild;
    prototype.groupChild = function(node, info, groups, level) {
      if (!isServerView(this)) {
        return originalGroupChild.call(this, node, info, groups, level);
      }

      if (info && info.type === 'node' && info.node) {
        return ensureNodeGroup(this, node, info.node, info);
      }

      if (isGuestInfo(info) && info.node) {
        const folderId = getFolderForVm(info.vmid);
        const folder = folderId ? folders[folderId] : null;
        if (folder && folder.node === info.node) {
          const rootNode = findRootNode(node);
          const folderNode = ensureFolderNode(this, rootNode, folderId);
          if (folderNode) {
            return this.addChildSorted(folderNode, info);
          }
        }
      }

      return originalGroupChild.call(this, node, info, groups, level);
    };

    const originalInitComponent = prototype.initComponent;
    prototype.initComponent = function() {
      const result = originalInitComponent.apply(this, arguments);
      bindTree(this);
      return result;
    };

    getTrees().forEach(bindTree);
    return true;
  }

  function installGlobalApi() {
    window.PVEVmFolders = {
      folders: folders,
      create: createFolder,
      rename: renameFolder,
      remove: removeFolder,
      addVm: addVmToFolder,
      removeVm: removeVmFromFolder,
      getFolder: getFolderForVm,
      getFoldersForNode: getFoldersForNode,
      setCollapsed: setFolderCollapsed,
      reload: function(callback) {
        loadFolders(function() {
          queueTreeRebuild(50);
          if (callback) {
            callback();
          }
        });
      },
    };
  }

  function bootstrap() {
    if (typeof Ext === 'undefined' || typeof Proxmox === 'undefined' || typeof PVE === 'undefined' || !PVE.tree || !PVE.tree.ResourceTree || !Proxmox.Utils || !Proxmox.Utils.API2Request) {
      return setTimeout(bootstrap, 100);
    }

    ensureStyles();
    installGlobalApi();
    bindResourceStore();
    installTreePatch();
    ensureTopEditButtonLater();
    loadFolders(function() {
      queueTreeRebuild(50);
      getTrees().forEach(bindTree);
      ensureTopEditButtonLater();
    });
  }

  bootstrap();
})();
