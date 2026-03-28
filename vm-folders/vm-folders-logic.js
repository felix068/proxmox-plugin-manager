/* VMFOLDERS: Gestion des dossiers */
if (info.vmid && window.PVEVmFolders) {
    let folderId = PVEVmFolders.getFolder(info.vmid);
    if (folderId && PVEVmFolders.folders[folderId]) {
        let folder = PVEVmFolders.folders[folderId];
        let folderNode = rootnode.findChild("id", folderId, false);
        if (!folderNode) {
            folderNode = me.addChildSorted(rootnode, {
                id: folderId,
                type: "folder",
                text: folder.name + " (" + folder.items.length + ")",
                iconCls: folder.collapsed ? "fa fa-folder" : "fa fa-folder-open",
                leaf: false,
                expanded: !folder.collapsed
            });
        }
        if (!folder.collapsed) {
            let child = me.addChildSorted(folderNode, info);
            if (child) { index[item.data.id] = child; }
            return;
        }
    }
}
/* FIN VMFOLDERS */
