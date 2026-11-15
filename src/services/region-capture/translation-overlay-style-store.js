const fs = require("fs");
const { POSITION_VALUES } = require("./translation-overlay-position");

const DEFAULT_OVERLAY_STYLE = Object.freeze({
  fontFamily: "Microsoft YaHei UI",
  fontSize: 17,
  fontWeight: 700,
  textColor: "#fff7df",
  textOpacity: 1,
  outline: true,
  outlineColor: "#231713",
  backgroundColor: "#000000",
  backgroundOpacity: 0,
  position: "near-source",
  offsetX: 0,
  offsetY: 0,
  fade: true,
  animationDurationMs: 160
});

function numberInRange(value, fallback, min, max) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(max, Math.max(min, numeric)) : fallback;
}

function color(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value) : fallback;
}

function normalizeStyle(value = {}) {
  return {
    fontFamily: [
      "Microsoft YaHei UI", "Microsoft YaHei", "Segoe UI", "SimSun",
      "SimHei", "KaiTi", "Arial", "Verdana", "Tahoma", "Georgia"
    ].includes(value.fontFamily)
      ? value.fontFamily : DEFAULT_OVERLAY_STYLE.fontFamily,
    fontSize: numberInRange(value.fontSize, DEFAULT_OVERLAY_STYLE.fontSize, 12, 40),
    fontWeight: [400, 500, 600, 700, 800].includes(Number(value.fontWeight))
      ? Number(value.fontWeight) : DEFAULT_OVERLAY_STYLE.fontWeight,
    textColor: color(value.textColor, DEFAULT_OVERLAY_STYLE.textColor),
    textOpacity: numberInRange(value.textOpacity, DEFAULT_OVERLAY_STYLE.textOpacity, 0, 1),
    outline: value.outline !== false,
    outlineColor: color(value.outlineColor, DEFAULT_OVERLAY_STYLE.outlineColor),
    backgroundColor: color(value.backgroundColor, DEFAULT_OVERLAY_STYLE.backgroundColor),
    backgroundOpacity: numberInRange(value.backgroundOpacity, DEFAULT_OVERLAY_STYLE.backgroundOpacity, 0, 1),
    position: POSITION_VALUES.includes(value.position)
      ? value.position : DEFAULT_OVERLAY_STYLE.position,
    offsetX: numberInRange(value.offsetX, 0, -1000, 1000),
    offsetY: numberInRange(value.offsetY, 0, -1000, 1000),
    fade: value.fade !== false,
    animationDurationMs: numberInRange(value.animationDurationMs, DEFAULT_OVERLAY_STYLE.animationDurationMs, 0, 1000)
  };
}

function normalizeOverlayStyles(value = {}) {
  const regionRefreshIntervalMs = numberInRange(value.regionRefreshIntervalMs, 1600, 1000, 15000);
  const requestedRegionDuration = numberInRange(value.regionOverlayDurationMs, 1200, 100, 14900);
  return {
    shareStyles: value.shareStyles !== false,
    sharePositionAnimation: value.sharePositionAnimation !== false,
    fullscreen: normalizeStyle(value.fullscreen || value.shared),
    region: normalizeStyle(value.region || value.shared || value.fullscreen),
    regionRefreshIntervalMs,
    regionOverlayDurationMs: Math.min(requestedRegionDuration, regionRefreshIntervalMs - 100)
  };
}

class TranslationOverlayStyleStore {
  constructor(filePath) { this.filePath = filePath; }

  readAll() {
    try {
      return normalizeOverlayStyles(JSON.parse(fs.readFileSync(this.filePath, "utf8")));
    } catch {
      return normalizeOverlayStyles();
    }
  }

  resolve(kind = "fullscreen") {
    const settings = this.readAll();
    if (kind !== "region") return settings.fullscreen;
    const styleKeys = ["fontFamily", "fontSize", "fontWeight", "textColor", "textOpacity", "outline", "outlineColor", "backgroundColor", "backgroundOpacity"];
    const positionKeys = ["position", "offsetX", "offsetY", "fade", "animationDurationMs"];
    const resolved = { ...settings.region };
    if (settings.shareStyles) for (const key of styleKeys) resolved[key] = settings.fullscreen[key];
    if (settings.sharePositionAnimation) for (const key of positionKeys) resolved[key] = settings.fullscreen[key];
    return resolved;
  }

  write(value) {
    const normalized = normalizeOverlayStyles(value);
    fs.mkdirSync(require("path").dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
    fs.renameSync(temporaryPath, this.filePath);
    return normalized;
  }
}

module.exports = {
  DEFAULT_OVERLAY_STYLE,
  TranslationOverlayStyleStore,
  normalizeOverlayStyles,
  normalizeStyle
};
