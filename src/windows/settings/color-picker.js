(function exposeColorPicker(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.overlayColorPicker = api;
})(typeof window === "undefined" ? globalThis : window, () => {
  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, Number(value) || 0));
  }

  function hexToHsv(hex) {
    const match = /^#([0-9a-f]{6})$/i.exec(String(hex || ""));
    if (!match) return null;
    const [r, g, b] = match[1].match(/../g).map((part) => parseInt(part, 16) / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
    let hue = 0;
    if (delta) {
      if (max === r) hue = 60 * (((g - b) / delta) % 6);
      else if (max === g) hue = 60 * ((b - r) / delta + 2);
      else hue = 60 * ((r - g) / delta + 4);
    }
    if (hue < 0) hue += 360;
    return [hue, (max ? delta / max : 0) * 100, max * 100];
  }

  function hsvToHex(hue, saturation, value) {
    const h = ((Number(hue) % 360) + 360) % 360;
    const s = clamp(saturation, 0, 100) / 100;
    const v = clamp(value, 0, 100) / 100;
    const chroma = v * s;
    const x = chroma * (1 - Math.abs((h / 60) % 2 - 1));
    const m = v - chroma;
    const sectors = [[chroma, x, 0], [x, chroma, 0], [0, chroma, x], [0, x, chroma], [x, 0, chroma], [chroma, 0, x]];
    const rgb = sectors[Math.min(5, Math.floor(h / 60))].map((component) => Math.round((component + m) * 255));
    return `#${rgb.map((component) => component.toString(16).padStart(2, "0")).join("")}`;
  }

  function boardSelection(clientX, clientY, rect) {
    return {
      saturation: Math.round(clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1) * 100),
      value: Math.round((1 - clamp((clientY - rect.top) / Math.max(1, rect.height), 0, 1)) * 100)
    };
  }

  function paletteStateForColor(hex) {
    const normalized = String(hex || "").trim().toLowerCase();
    const hsv = hexToHsv(normalized);
    if (!hsv) return null;
    return {
      hex: normalized,
      displayHex: normalized.toUpperCase(),
      hue: hsv[0],
      saturation: hsv[1],
      value: hsv[2]
    };
  }

  return { hexToHsv, hsvToHex, boardSelection, paletteStateForColor };
});
