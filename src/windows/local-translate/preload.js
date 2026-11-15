const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("localTranslate", {
  bootstrap: () => ipcRenderer.invoke("local-translate-bootstrap"),
  translate: (payload) => ipcRenderer.invoke("local-translate-request", payload),
  saveLanguages: (direction) => ipcRenderer.invoke("local-translate-save-languages", direction),
  saveSource: (source) => ipcRenderer.invoke("local-translate-save-source", source),
  cancel: (requestId) => ipcRenderer.send("local-translate-cancel", requestId),
  copy: (text) => ipcRenderer.invoke("local-translate-copy", text),
  setPinned: (pinned) => ipcRenderer.invoke("local-translate-set-pinned", pinned),
  toggleAllPinned: () => ipcRenderer.invoke("local-translate-toggle-all-pinned"),
  close: () => ipcRenderer.send("local-translate-close"),
  onChunk: (callback) => {
    ipcRenderer.on("local-translate-chunk", (_event, payload) => callback(payload));
  },
  onStatus: (callback) => {
    ipcRenderer.on("local-translate-status", (_event, payload) => callback(payload));
  },
  onPinState: (callback) => {
    ipcRenderer.on("local-translate-pin-state", (_event, pinned) => callback(pinned));
  }
});
