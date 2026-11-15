const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("translatorShell", {
  expandMenu: () => ipcRenderer.send("expand-menu"),
  collapseMenu: () => ipcRenderer.send("collapse-menu"),
  toggleFanMenu: () => ipcRenderer.send("toggle-fan-menu"),
  snapToNearestEdge: () => ipcRenderer.send("snap-to-nearest-edge"),
  triggerFeature: (action) => ipcRenderer.send("trigger-feature", action),
  setMenuHeight: (height) => ipcRenderer.send("set-menu-height", height),
  startDrag: (point, context = null) => ipcRenderer.send("drag-start", { point, context }),
  moveDrag: (point) => ipcRenderer.send("drag-move", point),
  endDrag: (payload) => ipcRenderer.send("drag-end", payload),
  setPointerPresence: (inside, point) => ipcRenderer.send("ball-pointer-presence", { inside, point }),
  animationFinished: (state) => ipcRenderer.send("ball-animation-finished", state),
  setAnimationHitRegions: (payload) => ipcRenderer.send("animation-hit-regions", payload),
  floatingUiAnimationFinished: (payload) => {
    ipcRenderer.send("floating-ui-animation-finished", payload);
  },
  onWindowState: (callback) => {
    ipcRenderer.on("window-state", (_event, state) => callback(state));
  },
  onAppNotice: (callback) => {
    ipcRenderer.on("app-notice", (_event, message) => callback(message));
  },
  onFloatingUiVisibilityAnimation: (callback) => {
    ipcRenderer.on("floating-ui-visibility-animation", (_event, payload) => {
      callback(payload);
    });
  }
});
