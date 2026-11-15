const { BrowserWindow, screen } = require("electron");
const { APP_ICON_PATH, APP_NAME, applyWindowAppDetails } = require("../../app-assets");
const { calculateOverlayBounds } = require("./translation-overlay-position");

function overlayTextCss(style = {}, tone = "normal") {
  const color = tone === "error" ? "#ff8b80" : style.textColor || "#fff7df";
  const outlineColor = style.outlineColor || "#231713";
  const outline = style.outline === false ? "0 2px 3px rgba(0,0,0,.75)" : `-1px -1px 1px ${outlineColor},1px -1px 1px ${outlineColor},-1px 1px 1px ${outlineColor},1px 1px 1px ${outlineColor},0 2px 3px rgba(0,0,0,.9)`;
  const background = `${style.backgroundColor || "#000000"}${Math.round(Number(style.backgroundOpacity || 0) * 255).toString(16).padStart(2, "0")}`;
  const animation = style.fade === false ? "none" : `overlay-in ${Number(style.animationDurationMs || 160)}ms ease-out`;
  const families = `${JSON.stringify(style.fontFamily || "Microsoft YaHei UI")},'Microsoft YaHei UI','Segoe UI',sans-serif`;
  return `box-sizing:border-box;padding:4px 7px;color:${color};opacity:${Number(style.textOpacity ?? 1)};font-family:${families};font-size:${Number(style.fontSize || 17)}px;font-weight:${Number(style.fontWeight || 700)};line-height:1.4;text-align:left;text-shadow:${outline};background:${background};animation:${animation};overflow-wrap:anywhere;white-space:normal`;
}

function createOverlayHtml(text, style = {}, tone = "normal") {
  return `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;overflow:hidden;background:transparent}@keyframes overlay-in{from{opacity:0}to{opacity:1}}.text{width:100vw;${overlayTextCss(style, tone)}}</style><div class="text"></div><script>document.querySelector('.text').textContent=${JSON.stringify(text)}</script>`;
}

function estimateOverlaySize(text, rect, style = {}, maximumHeight = 720) {
  const fontSize = Math.max(12, Number(style.fontSize || 17));
  const textUnits = Array.from(String(text || "")).reduce(
    (total, character) => total + (/\p{Script=Han}/u.test(character) ? 1 : 0.58),
    0
  );
  const width = Math.min(620, Math.max(180, rect.width, Math.min(460, textUnits * fontSize * 0.72 + 18)));
  const unitsPerLine = Math.max(4, (width - 14) / (fontSize * 0.72));
  const explicitLines = String(text || "").split(/\r?\n/);
  const lineCount = explicitLines.reduce(
    (total, line) => total + Math.max(1, Math.ceil(Array.from(line).reduce(
      (units, character) => units + (/\p{Script=Han}/u.test(character) ? 1 : 0.58),
      0
    ) / unitsPerLine)),
    0
  );
  const height = Math.min(
    Math.max(300, Number(maximumHeight) || 720),
    Math.max(54, Math.ceil(lineCount * fontSize * 1.4 + fontSize * 2))
  );
  return { width, height };
}

function clampOverlay(rect, display, index = 0, style = {}, text = "") {
  const maximumHeight = Math.max(300, Math.floor(display.workArea.height * 0.86));
  return calculateOverlayBounds(rect, display.workArea, estimateOverlaySize(text, rect, style, maximumHeight), style, index);
}

function findAvailableOverlayBounds(bounds, occupied, area) {
  const overlaps = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  const clamp = (candidate) => ({
    ...candidate,
    x: Math.min(Math.max(candidate.x, area.x), area.x + area.width - candidate.width),
    y: Math.min(Math.max(candidate.y, area.y), area.y + area.height - candidate.height)
  });
  const overlapArea = (candidate) => occupied.reduce((total, other) => {
    if (!overlaps(candidate, other)) return total;
    const width = Math.min(candidate.x + candidate.width, other.x + other.width) - Math.max(candidate.x, other.x);
    const height = Math.min(candidate.y + candidate.height, other.y + other.height) - Math.max(candidate.y, other.y);
    return total + Math.max(0, width) * Math.max(0, height);
  }, 0);
  const candidates = [bounds];
  for (let distance = 1; distance <= 5; distance += 1) {
    const vertical = distance * (bounds.height + 6);
    const horizontal = distance * (bounds.width + 6);
    candidates.push(
      { ...bounds, y: bounds.y + vertical },
      { ...bounds, y: bounds.y - vertical },
      { ...bounds, x: bounds.x + horizontal },
      { ...bounds, x: bounds.x - horizontal }
    );
  }
  let best = clamp(candidates[0]);
  let bestOverlap = overlapArea(best);
  for (const candidate of candidates.slice(1)) {
    const adjusted = clamp(candidate);
    const candidateOverlap = overlapArea(adjusted);
    if (candidateOverlap < bestOverlap) {
      best = adjusted;
      bestOverlap = candidateOverlap;
    }
    if (candidateOverlap === 0) break;
  }
  return best;
}

class TranslationOverlayManager {
  constructor({ getStyle = () => ({}) } = {}) { this.entries = new Map(); this.getStyle = getStyle; }

  avoidOverlap(bounds, id, display) {
    const area = display.workArea;
    const occupied = [...this.entries.entries()]
      .filter(([otherId, entry]) => otherId !== id && !entry.window.isDestroyed())
      .map(([, entry]) => entry.window.getBounds());
    return findAvailableOverlayBounds(bounds, occupied, area);
  }

  set(id, { text, rect, tone = "normal", persistent = false, durationMs = 0, index = 0, kind = "fullscreen" }) {
    if (!text || !rect) return;
    let entry = this.entries.get(id);
    const display = screen.getDisplayMatching(rect);
    const style = this.getStyle(kind) || {};
    const bounds = this.avoidOverlap(clampOverlay(rect, display, index, style, text), id, display);
    if (!entry || entry.window.isDestroyed()) {
      const window = new BrowserWindow({
        ...bounds, show: false, frame: false, transparent: true, resizable: false,
        movable: false, focusable: false, skipTaskbar: true, alwaysOnTop: true,
        fullscreenable: false, title: APP_NAME, icon: APP_ICON_PATH,
        webPreferences: { contextIsolation: true, nodeIntegration: false }
      });
      applyWindowAppDetails(window);
      window.setAlwaysOnTop(true, "screen-saver");
      window.setIgnoreMouseEvents(true);
      entry = { window, timer: null, persistent };
      this.entries.set(id, entry);
      window.on("closed", () => { if (this.entries.get(id)?.window === window) this.entries.delete(id); });
    } else entry.window.setBounds(bounds, false);
    clearTimeout(entry.timer);
    entry.persistent = persistent;
    const html = createOverlayHtml(text, style, tone);
    const shown = entry.window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).then(() => {
      if (entry.window.isDestroyed()) return false;
      entry.window.showInactive();
      return true;
    }).catch((error) => {
      console.error("[translation-overlay] display failed", { id, code: error?.code || "load-failed" });
      return false;
    });
    if (!persistent && Number(durationMs) > 0) {
      entry.timer = setTimeout(() => this.remove(id), Math.max(100, Number(durationMs)));
    }
    return shown;
  }

  remove(id) { const entry = this.entries.get(id); if (!entry) return; clearTimeout(entry.timer); if (!entry.window.isDestroyed()) entry.window.destroy(); this.entries.delete(id); }
  clear(prefix = "") { for (const id of [...this.entries.keys()]) if (!prefix || id.startsWith(prefix)) this.remove(id); }
  hideAll() { for (const entry of this.entries.values()) if (!entry.window.isDestroyed()) entry.window.hide(); }
  showAll() { for (const entry of this.entries.values()) if (!entry.window.isDestroyed()) entry.window.showInactive(); }
  describe(id) {
    const entry = this.entries.get(id);
    if (!entry || entry.window.isDestroyed()) return { exists: false };
    return {
      exists: true,
      visible: entry.window.isVisible(),
      alwaysOnTop: entry.window.isAlwaysOnTop(),
      bounds: entry.window.getBounds()
    };
  }
  dispose() { this.clear(); }
}

module.exports = { TranslationOverlayManager, clampOverlay, createOverlayHtml, estimateOverlaySize, findAvailableOverlayBounds, overlayTextCss };
