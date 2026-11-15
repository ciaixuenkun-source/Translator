const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("serviceSettings", {
  bootstrap: () => ipcRenderer.invoke("service-settings-bootstrap"),
  save: (payload) => ipcRenderer.invoke("service-settings-save", payload),
  testConnection: (payload) => ipcRenderer.invoke("service-settings-test-connection", payload),
  testTranslation: (payload) => ipcRenderer.invoke("service-settings-test-translation", payload),
  openExternal: (url) => ipcRenderer.invoke("service-settings-open-external", url),
  copyErrorDetails: (text) => ipcRenderer.invoke("service-settings-copy-error", text),
  saveAccountInfo: (payload) => ipcRenderer.invoke("service-settings-save-account-info", payload),
  clearAccountInfo: () => ipcRenderer.invoke("service-settings-clear-account-info"),
  close: () => ipcRenderer.send("service-settings-close")
});
