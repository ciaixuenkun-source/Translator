const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("gameMenu", {
  action: (action) => ipcRenderer.send("game-menu-action", action),
  close: () => ipcRenderer.send("game-menu-close"),
  onFocus: (callback) => ipcRenderer.on("game-menu-focus", callback)
});
