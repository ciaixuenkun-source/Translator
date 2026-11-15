const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("fanMenu", {
  close: () => ipcRenderer.send("fan-menu-close"),
  action: (action) => ipcRenderer.send("fan-menu-action", action),
  setInteractive: (interactive) => ipcRenderer.send("fan-menu-interactive", Boolean(interactive)),
  onState: (callback) => ipcRenderer.on("fan-menu-state", (_event, state) => callback(state))
});
