const path = require("path");
const { BrowserWindow, ipcMain, screen } = require("electron");
const { APP_ICON_PATH, APP_NAME, applyWindowAppDetails } = require("../../app-assets");
const { applyFloatingBallWindowLevel } = require("../../services/floating-ball/window-level");
const { gameMenuBounds } = require("./geometry");

class GameMenuController {
  constructor({ getAnchor, onAction }) {
    this.getAnchor = getAnchor;
    this.onAction = onAction;
    this.window = null;
    this.registerIpc();
  }
  registerIpc() {
    ipcMain.on("game-menu-action", (event, action) => {
      if (!this.window || this.window.isDestroyed() || event.sender.id !== this.window.webContents.id) return;
      this.close();
      this.onAction(action);
    });
    ipcMain.on("game-menu-close", (event) => {
      if (this.window && !this.window.isDestroyed() && event.sender.id === this.window.webContents.id) this.close();
    });
  }
  isOpen() { return Boolean(this.window && !this.window.isDestroyed() && this.window.isVisible()); }
  toggle() { if (this.isOpen()) this.close(); else this.open(); }
  open() {
    const anchor = this.getAnchor();
    if (!anchor) return;
    const display = screen.getDisplayMatching(anchor.bounds);
    const bounds = gameMenuBounds(anchor.bounds, display, anchor.edge);
    if (!this.window || this.window.isDestroyed()) {
      this.window = new BrowserWindow({
        ...bounds, show: false, frame: false, transparent: true, resizable: false,
        fullscreenable: false, skipTaskbar: true, alwaysOnTop: false,
        backgroundColor: "#00000000", icon: APP_ICON_PATH, title: APP_NAME,
        webPreferences: {
          preload: path.join(__dirname, "preload.js"),
          contextIsolation: true,
          nodeIntegration: false
        }
      });
      applyWindowAppDetails(this.window);
      applyFloatingBallWindowLevel(this.window);
      this.window.loadFile(path.join(__dirname, "index.html"));
      this.window.on("blur", () => this.close());
      this.window.on("closed", () => { this.window = null; });
    } else {
      this.window.setBounds(bounds, false);
    }
    applyFloatingBallWindowLevel(this.window);
    this.window.setIgnoreMouseEvents(false);
    this.window.setFocusable(true);
    this.window.show();
    this.window.focus();
    this.window.webContents.focus();
    this.window.webContents.send("game-menu-focus");
  }
  close() { if (this.window && !this.window.isDestroyed()) this.window.hide(); }
  dispose() { if (this.window && !this.window.isDestroyed()) this.window.destroy(); this.window = null; }
}
module.exports = { GameMenuController };
