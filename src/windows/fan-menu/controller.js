const path = require("path");
const { BrowserWindow, ipcMain, screen } = require("electron");
const { APP_ICON_PATH, APP_NAME, applyWindowAppDetails } = require("../../app-assets");
const { applyFloatingBallWindowLevel } = require("../../services/floating-ball/window-level");
const {
  MENU_SIZE,
  anchorInMenu,
  fanMenuBounds,
  fanMenuLayout,
  fanMenuNudge,
  fanMenuOffsets
} = require("./geometry");

class FanMenuController {
  constructor({ getAnchor, onAction = () => {}, onOpen = () => {}, onClose = () => {} }) {
    this.getAnchor = getAnchor;
    this.onAction = onAction;
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.window = null;
    this.openState = null;
    this.registerIpc();
  }

  registerIpc() {
    ipcMain.on("fan-menu-close", (event) => {
      if (this.owns(event.sender)) this.close();
    });
    ipcMain.on("fan-menu-interactive", (event, interactive) => {
      if (!this.owns(event.sender)) return;
      this.window.setIgnoreMouseEvents(!interactive, { forward: true });
    });
    ipcMain.on("fan-menu-action", (event, action) => {
      if (!this.owns(event.sender) || typeof action !== "string") return;
      this.close();
      this.onAction(action);
    });
  }

  owns(sender) {
    return Boolean(this.window && !this.window.isDestroyed() && sender.id === this.window.webContents.id);
  }

  isOpen() {
    return Boolean(this.window && !this.window.isDestroyed() && this.window.isVisible());
  }

  toggle() {
    if (this.isOpen()) this.close();
    else this.open();
  }

  ensureWindow() {
    if (this.window && !this.window.isDestroyed()) return;
    this.window = new BrowserWindow({
      ...MENU_SIZE,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      fullscreenable: false,
      skipTaskbar: true,
      focusable: true,
      alwaysOnTop: false,
      hasShadow: false,
      backgroundColor: "#00000000",
      icon: APP_ICON_PATH,
      title: APP_NAME,
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    applyWindowAppDetails(this.window);
    this.window.loadFile(path.join(__dirname, "index.html"));
    this.window.on("blur", () => {
      setTimeout(() => {
        if (this.isOpen() && !this.window.isFocused()) this.close();
      }, 0);
    });
    this.window.on("closed", () => {
      const wasOpen = Boolean(this.openState);
      this.window = null;
      this.openState = null;
      if (wasOpen) this.onClose();
    });
  }

  open() {
    const anchor = this.getAnchor();
    if (!anchor) return;
    this.ensureWindow();
    const display = screen.getDisplayMatching(anchor.bounds);
    const bounds = fanMenuBounds(anchor.bounds, display);
    const edge = anchor.docked ? anchor.edge : "floating";
    const layout = fanMenuLayout(edge, anchor.bounds, display);
    const localAnchor = anchorInMenu(anchor.bounds, bounds);
    const state = {
      mode: anchor.mode,
      layout,
      anchor: localAnchor,
      offsets: fanMenuOffsets(layout),
      nudge: fanMenuNudge(localAnchor, layout, bounds)
    };
    this.openState = state;
    this.window.setBounds(bounds, false);
    applyFloatingBallWindowLevel(this.window);
    this.window.setIgnoreMouseEvents(true, { forward: true });
    const show = () => {
      if (!this.window || this.window.isDestroyed()) return;
      this.window.webContents.send("fan-menu-state", state);
      this.window.show();
      this.window.focus();
      applyFloatingBallWindowLevel(this.window);
      this.onOpen();
    };
    if (this.window.webContents.isLoading()) this.window.webContents.once("did-finish-load", show);
    else show();
  }

  close() {
    if (!this.isOpen()) return;
    this.window.hide();
    this.openState = null;
    this.onClose();
  }

  dispose() {
    const wasOpen = this.isOpen();
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
    this.window = null;
    this.openState = null;
    if (wasOpen) this.onClose();
  }
}

module.exports = { FanMenuController };
