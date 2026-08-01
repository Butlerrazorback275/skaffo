const { contextBridge, ipcRenderer } = require('electron');

// main.cjs passes the real port via additionalArguments
const portArg = process.argv.find((a) => a.startsWith('--skaffo-port='));
const enginePort = portArg ? Number(portArg.split('=')[1]) : 8731;

contextBridge.exposeInMainWorld('skaffo', {
  isDesktop: true,
  enginePort,
  win: {
    minimize: () => ipcRenderer.invoke('win:minimize'),
    maximize: () => ipcRenderer.invoke('win:maximize'),
    close: () => ipcRenderer.invoke('win:close'),
  },
  app: {
    version: () => ipcRenderer.invoke('app:version'),
    platform: () => ipcRenderer.invoke('app:platform'),
  },
  engine: {
    port: () => ipcRenderer.invoke('engine:port'),
  },
});
