/* VMFOLDERS: Créer les nodes de dossiers */
if (window.PVEVmFolders) {
    for (let folderId in PVEVmFolders.folders) {
        let folder = PVEVmFolders.folders[folderId];
        let existingFolder = rootnode.findChild("id", folderId, false);
        if (!existingFolder) {
            me.addChildSorted(rootnode, {
                id: folderId,
                type: "folder",
                text: folder.name + " (" + (folder.items ? folder.items.length : 0) + ")",
                iconCls: folder.collapsed ? "fa fa-folder" : "fa fa-folder-open",
                leaf: false,
                expanded: !folder.collapsed
            });
        }
    }
}
/* FIN VMFOLDERS */