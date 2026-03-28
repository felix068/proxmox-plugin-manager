# Changelog VM-Folders Plugin

## Version 2.0 - 2026-01-26

### 🐛 Corrections Critiques

#### Bug #1: Disparition des dossiers pendant une fraction de seconde
**Problème:** Le ResourceTree de Proxmox reconstruit périodiquement le tree (tri, refresh), ce qui supprime nos éléments custom.

**Solution:**
- Ajout d'un MutationObserver intelligent qui détecte quand le tree change
- Le observer ignore nos propres mutations (pve-folder-row, pve-folder-item)
- Débounce avec `renderScheduled` pour éviter les re-renders multiples
- Timeout de 50ms pour grouper les changements

**Code:**
```javascript
const observer = new MutationObserver((mutations) => {
  const isOurMutation = mutations.some(m => {
    return Array.from(m.addedNodes).some(n =>
      n.classList && (n.classList.contains('pve-folder-row') || n.classList.contains('pve-folder-item'))
    ) || Array.from(m.removedNodes).some(n =>
      n.classList && (n.classList.contains('pve-folder-row') || n.classList.contains('pve-folder-item'))
    );
  });

  if (!isOurMutation) {
    console.log('[VM-Folders] Tree changed, re-rendering folders');
    renderFolders();
  }
});
```

#### Bug #2: Dossiers disparaissent au reload de la page
**Problème:** Les dossiers n'étaient pas persistés correctement dans `/etc/pve/vm-folders.json`.

**Solution:**
- Ajout de logs pour debug (`console.log('[VM-Folders] ...')`)
- Vérification de la réponse API avec try/catch
- Timeout de sauvegarde augmenté à 500ms
- Format JSON correctement stringifié : `JSON.stringify(folders)`

**Code:**
```javascript
function loadFolders(callback) {
  Proxmox.Utils.API2Request({
    url: '/api2/json/pluginmanager/folders',
    method: 'GET',
    success: function(response) {
      try {
        folders = response.result.data || {};
        console.log('[VM-Folders] Loaded folders:', Object.keys(folders).length);
      } catch (e) {
        console.error('[VM-Folders] Load error:', e);
        folders = {};
      }
      if (callback) callback();
    },
    failure: function(err) {
      console.warn('[VM-Folders] Load failed, using empty:', err);
      folders = {};
      if (callback) callback();
    }
  });
}

function saveFolders() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(function() {
    const data = JSON.stringify(folders);
    console.log('[VM-Folders] Saving folders:', Object.keys(folders).length);
    Proxmox.Utils.API2Request({
      url: '/api2/json/pluginmanager/folders',
      method: 'PUT',
      params: { data: data },
      success: function() {
        console.log('[VM-Folders] Saved successfully');
      },
      failure: function(response) {
        console.error('[VM-Folders] Save failed:', response);
      }
    });
  }, 500);
}
```

#### Bug #3: Toolbar en clair sur thème sombre
**Problème:** Les couleurs de la toolbar et des boutons étaient hardcodées pour le thème clair.

**Solution:**
- Fonction `isDarkTheme()` qui détecte le thème actif
- Fonction `getThemeColors()` qui retourne les couleurs adaptées
- Boutons avec hover states dynamiques
- Support des préférences système (`prefers-color-scheme: dark`)

**Code:**
```javascript
function isDarkTheme() {
  const body = document.body;
  const html = document.documentElement;
  return body.classList.contains('x-theme-dark') ||
         html.classList.contains('x-theme-dark') ||
         body.classList.contains('dark') ||
         window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function getThemeColors() {
  const dark = isDarkTheme();
  return {
    toolbarBg: dark ? '#2a2a2a' : '#f5f5f5',
    toolbarBorder: dark ? '#3a3a3a' : '#d0d0d0',
    btnBg: dark ? '#3a3a3a' : '#fff',
    btnBorder: dark ? '#4a4a4a' : '#d0d0d0',
    btnText: dark ? '#ddd' : '#000',
    btnHover: dark ? '#4a4a4a' : '#e6e6e6',
    btnActive: dark ? '#5a7a8a' : '#c2ddf2',
    rowBorder: dark ? '#3a3a3a' : '#d0d0d0',
    text: dark ? '#ddd' : '#000',
    textSecondary: dark ? '#999' : '#555',
    iconDelete: '#cf1322',
    hoverBg: dark ? '#3a4a5a' : '#c2ddf2'
  };
}
```

---

### ✅ Améliorations

#### Logs de débogage
Tous les événements importants sont loggés avec le préfixe `[VM-Folders]` :
- Chargement des dossiers
- Sauvegarde des dossiers
- Changements du tree
- Erreurs

Pour voir les logs dans la console navigateur : F12 > Console

#### Débounce optimisé
Le re-render est débounced avec un flag global `renderScheduled` pour éviter les appels multiples simultanés.

#### Structure propre
- Tous les IDs sont uniques (compteur global)
- Structure TABLE native (comme Proxmox)
- Indentation correcte (2 × 18px)
- Accessibilité (aria-level, aria-expanded)

---

### 🔧 Vérifications

Pour vérifier que la persistance fonctionne :

```bash
# SSH dans la VM Proxmox
ssh root@<IP>

# Vérifier que le fichier existe
ls -la /etc/pve/vm-folders.json

# Voir le contenu
cat /etc/pve/vm-folders.json

# Devrait afficher quelque chose comme :
# {"folder-1737897123456":{"name":"Test","items":["100","101"],"collapsed":false}}
```

Pour voir les logs en temps réel :
1. Ouvrir Proxmox dans le navigateur
2. F12 > Console
3. Filtrer par "VM-Folders"
4. Voir les logs de chargement/sauvegarde

---

### 📦 Installation

```bash
# Depuis votre machine locale
cd /home/tpm28/firecracker
tar czf proxmox-plugins.tar.gz proxmox-plugins/
scp proxmox-plugins.tar.gz root@<IP>:/tmp/

# Dans la VM Proxmox
ssh root@<IP>
cd /tmp
tar xzf proxmox-plugins.tar.gz
cd proxmox-plugins
bash install.sh

# Vérifier les services
systemctl status pveproxy
systemctl status pve-plugin-api

# Dans le navigateur
# 1. Vider le cache (Ctrl+Shift+R)
# 2. Datacenter > Options > Plugins
# 3. Sélectionner "vm-folders"
# 4. Cliquer "Install"
# 5. Recharger (Ctrl+F5)
```

---

### 🎨 Support Thème Sombre

Le plugin détecte automatiquement le thème et s'adapte :

**Thème Clair:**
- Background toolbar: #f5f5f5
- Boutons: #fff
- Texte: #000

**Thème Sombre:**
- Background toolbar: #2a2a2a
- Boutons: #3a3a3a
- Texte: #ddd

Les couleurs s'adaptent aussi au hover et au mode édition actif.

---

### 📝 Notes Techniques

#### Pourquoi le tree se reconstruit ?

Proxmox utilise `PVE.tree.ResourceTree` qui hérite de `Ext.tree.TreePanel`. Ce composant ExtJS :
- Trie automatiquement les nœuds (fonction `nodeSortFn`)
- Reconstruit périodiquement le DOM lors du refresh des données
- Utilise un système de virtualisation pour les grandes listes

Notre solution injecte les dossiers après chaque reconstruction, ce qui crée l'effet de "disparition pendant 50ms" mais garantit que les dossiers réapparaissent toujours.

#### Persistance avec /etc/pve/

Le répertoire `/etc/pve/` est un filesystem spécial de Proxmox qui :
- Est synchronisé automatiquement entre tous les nœuds du cluster
- Persiste les configurations (VM, users, etc.)
- Est accessible en lecture/écriture par l'API Perl

Notre fichier `vm-folders.json` y est stocké pour bénéficier de cette synchronisation automatique.

---

### 🐛 Debug

Si les dossiers ne persistent pas :

```bash
# Vérifier les permissions
ls -la /etc/pve/vm-folders.json
# Devrait être: -rw-r----- 1 root www-data

# Vérifier l'API Perl
grep -A 10 "get_folders" /usr/share/perl5/PVE/API2/PluginManager.pm

# Tester l'API directement
curl -k -H "Authorization: PVEAPIToken=root@pam!test=xxxx" \
  https://localhost:8006/api2/json/pluginmanager/folders

# Voir les logs
journalctl -u pveproxy -f
```

Si le thème ne se détecte pas :

```javascript
// Dans la console navigateur (F12)
console.log('Dark theme?', document.body.classList.contains('x-theme-dark'));
console.log('Prefers dark?', window.matchMedia('(prefers-color-scheme: dark)').matches);
```

---

### 🚀 Prochaines Versions

Idées pour v3.0 :
- Drag-and-drop entre dossiers sans passer par le mode édition
- Dossiers imbriqués (sous-dossiers)
- Couleurs personnalisées par dossier
- Icônes personnalisées
- Tri des dossiers (alphabétique, par nombre de VMs)
- Recherche/filtre dans les dossiers
- Export/Import de la structure en JSON
- API REST complète pour gérer les dossiers
