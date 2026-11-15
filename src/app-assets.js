const path = require("path");

const APP_ID = "com.translator.desktop";
const APP_NAME = "Trans";
const APP_ICON_PATH = path.join(__dirname, "assets", "icons", "app-icon.ico");

function applyWindowAppDetails(window) {
  if (process.platform !== "win32" || !window || window.isDestroyed?.()) return;
  window.setAppDetails?.({
    appId: APP_ID,
    appIconPath: APP_ICON_PATH,
    appIconIndex: 0,
    relaunchDisplayName: APP_NAME
  });
}

module.exports = { APP_ID, APP_ICON_PATH, APP_NAME, applyWindowAppDetails };
