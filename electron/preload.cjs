// The only desktop features the game page can reach: reading and changing the window's display mode.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kineticDesktop', {
  getDisplayMode: () => ipcRenderer.invoke('display:get'),
  setDisplayMode: (mode) => ipcRenderer.invoke('display:set', mode),
});
