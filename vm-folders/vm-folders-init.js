/* VMFOLDERS_NATIVE */
(function(){
  // Variable pour la clé de stockage et l'objet de données
  var K="pve-vm-folders",F={};

  // Tentative de chargement des dossiers depuis le localStorage
  try{
    var s=localStorage.getItem(K);
    if(s)F=JSON.parse(s);
  }catch(e){}

  // Création de l'objet global PVEVmFolders avec toutes les méthodes nécessaires
  window.PVEVmFolders={
    // Objet contenant tous les dossiers créés
    folders:F,

    // Méthode pour sauvegarder les dossiers dans le localStorage
    save:function(){
      localStorage.setItem(K,JSON.stringify(F));
    },

    // Méthode pour retrouver le dossier où se trouve une VM donnée
    getFolder:function(vmId){
      // On parcourt tous les dossiers pour trouver celui qui contient la VM
      for(var f in F){
        // Vérification si la VM est dans la liste des items du dossier
        if(F[f].items&&F[f].items.indexOf(String(vmId))>-1){
          return f;
        }
      }
      return null;
    },

    // Méthode pour créer un nouveau dossier
    create:function(n){
      // Génération d'un ID unique basé sur le timestamp
      var id="folder-"+Date.now();
      // Création de l'objet dossier avec nom, liste vide de VMs et état plié/déplié
      F[id]={name:n,items:[],collapsed:false};
      this.save();
      return id;
    },

    // Méthode pour supprimer un dossier
    remove:function(id){
      delete F[id];
      this.save();
    },

    // Méthode pour renommer un dossier
    rename:function(id,n){
      if(F[id])F[id].name=n;
      this.save();
    },

    // Méthode pour ajouter une VM à un dossier
    addVm:function(vmId,fid){
      if(!F[fid])return;
      var s=String(vmId);
      // On vérifie que la VM n'est pas déjà dans le dossier
      if(F[fid].items.indexOf(s)<0){
        // Ajout de la VM dans la liste du dossier
        F[fid].items.push(s);
        this.save();
      }
    },

    // Méthode pour retirer une VM d'un dossier
    removeVm:function(vmId,fid){
      if(!F[fid])return;
      var i=F[fid].items.indexOf(String(vmId));
      if(i>-1){
        // Suppression de la VM de la liste du dossier (splice supprime un élément)
        F[fid].items.splice(i,1);
        this.save();
      }
    },

    // Méthode pour plier/déplier un dossier
    toggle:function(id){
      if(F[id])F[id].collapsed=!F[id].collapsed;
      this.save();
    }
  };
})();
