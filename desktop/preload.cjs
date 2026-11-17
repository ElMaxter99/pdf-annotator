'use strict';
// Puente mínimo y explícito entre la web y el proceso principal. Nada de Node en la web.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  helperPort: ipcRenderer.sendSync('desktop:helper-port'),
  getUpdateState: () => ipcRenderer.invoke('desktop:update:get'),
  onUpdateState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('desktop:update:state', listener);
    return () => ipcRenderer.removeListener('desktop:update:state', listener);
  },
  onOpenUpdates: (callback) => {
    const listener = (_event, payload) => callback({ check: payload?.check === true });
    ipcRenderer.on('desktop:update:open-panel', listener);
    return () => ipcRenderer.removeListener('desktop:update:open-panel', listener);
  },
  checkForUpdates: () => ipcRenderer.invoke('desktop:update:check'),
  downloadUpdate: () => ipcRenderer.invoke('desktop:update:download'),
  setUpdateChannel: (channel) => ipcRenderer.invoke('desktop:update:set-channel', channel),
  cancelUpdate: () => ipcRenderer.invoke('desktop:update:cancel'),
  installUpdate: () => ipcRenderer.invoke('desktop:update:install'),
  installOnQuit: () => ipcRenderer.invoke('desktop:update:install-on-quit'),
  onZoomCommand: (callback) => {
    const listener = (_event, command) => callback(command);
    ipcRenderer.on('desktop:zoom', listener);
    return () => ipcRenderer.removeListener('desktop:zoom', listener);
  },
  dismissUpdated: () => ipcRenderer.invoke('desktop:update:dismiss-updated'),
  projects: {
    info: () => ipcRenderer.invoke('projects:info'),
    chooseRoot: () => ipcRenderer.invoke('projects:choose-root'),
    list: () => ipcRenderer.invoke('projects:list'),
    create: (input) => ipcRenderer.invoke('projects:create', input),
    open: (input) => ipcRenderer.invoke('projects:open', input),
    saveItem: (input) => ipcRenderer.invoke('projects:save-item', input),
    removeItem: (input) => ipcRenderer.invoke('projects:remove-item', input),
    renew: (input) => ipcRenderer.invoke('projects:renew', input),
    release: (input) => ipcRenderer.invoke('projects:release', input),
    rename: (input) => ipcRenderer.invoke('projects:rename', input),
    forget: (input) => ipcRenderer.invoke('projects:forget', input),
    exportInfo: (input) => ipcRenderer.invoke('projects:export-info', input),
    exportProject: (input) => ipcRenderer.invoke('projects:export', input),
    reveal: () => ipcRenderer.invoke('projects:reveal'),
    // `path` solo viene de soltar un archivo: el proceso principal lo revisa entero antes de fiarse de él.
    importInspect: (input) => ipcRenderer.invoke('projects:import-inspect', input),
    importRun: (input) => ipcRenderer.invoke('projects:import-run', input),
    cancel: () => ipcRenderer.invoke('projects:cancel'),
    pathForFile: (file) => {
      try {
        return webUtils.getPathForFile(file) || '';
      } catch {
        return '';
      }
    },
    onProgress: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('projects:progress', listener);
      return () => ipcRenderer.removeListener('projects:progress', listener);
    },
  },
  openReleasePage: () => ipcRenderer.invoke('desktop:update:open-release'),
});
