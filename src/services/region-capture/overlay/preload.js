const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("regionCapture", {
  confirm: (payload) => ipcRenderer.send("region-capture-confirm", payload),
  cancel: (reason) => ipcRenderer.send("region-capture-cancel", reason),
  ready: (success) => ipcRenderer.send("region-capture-ready", success),
  interactive: () => ipcRenderer.send("region-capture-interactive"),
  onStart: (listener) => {
    ipcRenderer.on("region-capture-start", (_event, payload) => listener(payload));
  },
  onShown: (listener) => {
    ipcRenderer.on("region-capture-shown", () => listener());
  }
});
