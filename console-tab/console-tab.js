(function() {
  'use strict';

  const LOG_PREFIX = '[Console Tab]';

  function log() {
    console.log.apply(console, [LOG_PREFIX].concat(Array.from(arguments)));
  }

  function makeQuery(params) {
    return Ext.Object.toQueryString(params);
  }

  function openTab(url) {
    const win = window.open(url, '_blank');
    if (win) {
      win.focus();
    }
  }

  function patchVncOpener() {
    if (!PVE || !PVE.Utils || !PVE.Utils.openVNCViewer) {
      return false;
    }

    if (PVE.Utils.__consoleTabVncPatched) {
      return true;
    }

    PVE.Utils.openVNCViewer = function(vmtype, vmid, nodename, vmname, cmd) {
      let scaling = 'off';
      if (Proxmox.Utils.toolkit !== 'touch') {
        const sp = Ext.state.Manager.getProvider();
        scaling = sp.get('novnc-scaling', 'off');
      }

      const query = makeQuery({
        console: vmtype,
        novnc: 1,
        vmid: vmid,
        vmname: vmname,
        node: nodename,
        resize: scaling,
        cmd: cmd,
      });

      openTab('?' + query);
    };

    PVE.Utils.__consoleTabVncPatched = true;
    return true;
  }

  function patchXtermOpener() {
    if (!Proxmox || !Proxmox.Utils || !Proxmox.Utils.openXtermJsViewer) {
      return false;
    }

    if (Proxmox.Utils.__consoleTabXtermPatched) {
      return true;
    }

    Proxmox.Utils.openXtermJsViewer = function(consoleType, vmid, nodename, vmname, cmd) {
      const query = makeQuery({
        console: consoleType,
        xtermjs: 1,
        vmid: vmid,
        vmname: vmname,
        node: nodename,
        cmd: cmd,
      });

      openTab('?' + query);
    };

    Proxmox.Utils.__consoleTabXtermPatched = true;
    return true;
  }

  function bootstrap() {
    if (typeof Ext === 'undefined' || typeof PVE === 'undefined' || typeof Proxmox === 'undefined') {
      return setTimeout(bootstrap, 100);
    }

    const patchedVnc = patchVncOpener();
    const patchedXterm = patchXtermOpener();

    if (!patchedVnc || !patchedXterm) {
      setTimeout(bootstrap, 250);
      return;
    }

    log('Console openers patched');
  }

  bootstrap();
})();
