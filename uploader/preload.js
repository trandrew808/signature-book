const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("booth", {
  get: () => ipcRenderer.invoke("settings:get"),
  pickFolder: () => ipcRenderer.invoke("settings:pickFolder"),
  save: (v) => ipcRenderer.invoke("settings:save", v),
  openFolder: () => ipcRenderer.invoke("settings:openFolder"),
});
