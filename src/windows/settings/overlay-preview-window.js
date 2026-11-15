const { BrowserWindow, screen } = require("electron");
const { APP_ICON_PATH, APP_NAME, applyWindowAppDetails } = require("../../app-assets");
const { overlayTextCss } = require("../../services/region-capture/translation-overlay-manager");
const { calculateOverlayBounds } = require("../../services/region-capture/translation-overlay-position");

const STYLE_PREVIEW_SIZE = Object.freeze({ width: 360, height: 88 });
const POSITION_PREVIEW_SIZE = Object.freeze({ width: 460, height: 230 });
const PREVIEW_TEXT = "You have acquired a skill.";
const REFERENCE_TEXT = "游戏译文";

function previewBounds(settingsWindow, mode = "style") {
  const parentBounds = settingsWindow?.getBounds?.() || { x: 0, y: 0, width: 800, height: 700 };
  const display = screen.getDisplayMatching(parentBounds);
  const area = display.workArea;
  const size = mode === "position" ? POSITION_PREVIEW_SIZE : STYLE_PREVIEW_SIZE;
  const preferredX = parentBounds.x + parentBounds.width + 12;
  const leftFallback = parentBounds.x - size.width - 12;
  let x = preferredX + size.width <= area.x + area.width ? preferredX : leftFallback;
  if (x < area.x) x = area.x + Math.round((area.width - size.width) / 2);
  return {
    x: Math.min(area.x + area.width - size.width, Math.max(area.x, Math.round(x))),
    y: Math.min(area.y + area.height - size.height, Math.max(area.y, parentBounds.y + 60)),
    ...size
  };
}

function createPreviewHtml(style = {}, mode = "style") {
  if (mode !== "position") {
    return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;overflow:hidden;background:transparent;user-select:none}
    @keyframes overlay-in{from{opacity:0}to{opacity:1}}
    body{display:flex;align-items:center;padding:8px;box-sizing:border-box}
    .translation{max-width:344px;${overlayTextCss(style)}}
    </style></head><body><div class="translation"></div><script>
    document.querySelector('.translation').textContent=${JSON.stringify(PREVIEW_TEXT)};
    </script></body></html>`;
  }
  const canvas = { x: 0, y: 0, width: POSITION_PREVIEW_SIZE.width, height: POSITION_PREVIEW_SIZE.height };
  const source = { x: 155, y: 91, width: 150, height: 48 };
  const placed = calculateOverlayBounds(source, canvas, { width: 270, height: 58 }, style);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{width:100%;height:100%;margin:0;overflow:hidden;background:transparent;user-select:none}
  @keyframes overlay-in{from{opacity:0}to{opacity:1}}
  .stage{position:relative;width:100%;height:100%;box-sizing:border-box}
  .reference{position:absolute;left:${source.x}px;top:${source.y}px;width:${source.width}px;height:${source.height}px;display:grid;place-items:center;box-sizing:border-box;border:1px dashed rgba(255,244,220,.72);border-radius:8px;background:rgba(112,82,68,.72);color:#fff4dc;font:700 18px 'Microsoft YaHei UI','Segoe UI',sans-serif}
  .translation{position:absolute;left:${placed.x}px;top:${placed.y}px;width:${placed.width}px;min-height:${placed.height}px;${overlayTextCss(style)}}
  </style></head><body><div class="stage"><div class="reference"></div><div class="translation"></div></div><script>
  document.querySelector('.reference').textContent=${JSON.stringify(REFERENCE_TEXT)};
  document.querySelector('.translation').textContent=${JSON.stringify(PREVIEW_TEXT)};
  </script></body></html>`;
}

class OverlayPreviewWindow {
  constructor(getSettingsWindow) {
    this.getSettingsWindow = getSettingsWindow;
    this.window = null;
    this.enabled = false;
    this.latestStyle = {};
    this.mode = "style";
  }

  update(style = {}, { open = true, mode = "style" } = {}) {
    const settingsWindow = this.getSettingsWindow();
    if (!settingsWindow || settingsWindow.isDestroyed()) return;
    this.latestStyle = { ...style };
    this.mode = mode === "position" ? "position" : "style";
    if (open) this.enabled = true;
    if (!this.enabled) return;
    if (!this.window || this.window.isDestroyed()) {
      this.window = new BrowserWindow({
        ...previewBounds(settingsWindow, this.mode), show: false, frame: false,
        transparent: true, hasShadow: false, resizable: false, movable: false, focusable: false,
        skipTaskbar: true, alwaysOnTop: true, fullscreenable: false,
        title: APP_NAME, icon: APP_ICON_PATH,
        webPreferences: { contextIsolation: true, nodeIntegration: false }
      });
      applyWindowAppDetails(this.window);
      this.window.setAlwaysOnTop(true, "floating");
      this.window.setIgnoreMouseEvents(true);
      this.window.on("closed", () => { this.window = null; });
    } else {
      this.window.setBounds(previewBounds(settingsWindow, this.mode), false);
    }
    const html = createPreviewHtml(this.latestStyle, this.mode);
    this.window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
      .then(() => { if (this.enabled && settingsWindow.isFocused() && this.window && !this.window.isDestroyed()) this.window.showInactive(); })
      .catch(() => {});
  }

  handleSettingsBlur() {
    this.enabled = false;
    if (this.window && !this.window.isDestroyed()) this.window.hide();
  }

  handleSettingsMove() {
    if (this.enabled && this.window && !this.window.isDestroyed()) {
      this.window.setBounds(previewBounds(this.getSettingsWindow(), this.mode), false);
    }
  }

  hide() {
    this.enabled = false;
    if (this.window && !this.window.isDestroyed()) this.window.hide();
  }

  close() {
    this.enabled = false;
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
    this.window = null;
  }

  dispose() { this.close(); }
}

module.exports = { OverlayPreviewWindow, STYLE_PREVIEW_SIZE, POSITION_PREVIEW_SIZE, PREVIEW_TEXT, REFERENCE_TEXT, previewBounds, createPreviewHtml };
