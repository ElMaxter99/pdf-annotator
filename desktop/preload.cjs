'use strict';
// Puente mínimo y explícito entre la web y el proceso principal. Nada de Node en la web.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  helperPort: ipcRenderer.sendSync('desktop:helper-port'),
  getUpdateState: () => ipcRenderer.invoke('desktop:update:get'),
  onUpdateState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('desktop:update:state', listener);
    return () => ipcRenderer.removeListener('desktop:update:state', listener);
  },
  checkForUpdates: () => ipcRenderer.invoke('desktop:update:check'),
  downloadUpdate: () => ipcRenderer.invoke('desktop:update:download'),
  setUpdateChannel: (channel) => ipcRenderer.invoke('desktop:update:set-channel', channel),
  cancelUpdate: () => ipcRenderer.invoke('desktop:update:cancel'),
  installUpdate: () => ipcRenderer.invoke('desktop:update:install'),
  installOnQuit: () => ipcRenderer.invoke('desktop:update:install-on-quit'),
  openReleasePage: () => ipcRenderer.invoke('desktop:update:open-release'),
});
