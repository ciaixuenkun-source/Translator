const POSITION_VALUES = Object.freeze([
  "near-source", "above-source", "below-source", "left-source",
  "right-source", "top-center", "custom"
]);

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function calculateOverlayBounds(rect, workArea, size, style = {}, index = 0) {
  const area = workArea;
  const source = rect || {
    x: area.x + Math.round(area.width / 2) - 120,
    y: area.y + 90,
    width: 240,
    height: 48
  };
  const width = Math.min(area.width, Math.max(1, finite(size?.width, 320)));
  const height = Math.min(area.height, Math.max(1, finite(size?.height, 72)));
  const gap = 6;
  const position = POSITION_VALUES.includes(style.position) ? style.position : "near-source";
  let x = source.x;
  let y = source.y + source.height + gap;

  if (position === "above-source") {
    x = source.x + (source.width - width) / 2;
    y = source.y - height - gap;
  } else if (position === "below-source") {
    x = source.x + (source.width - width) / 2;
    y = source.y + source.height + gap;
  } else if (position === "left-source") {
    x = source.x - width - gap;
    y = source.y + (source.height - height) / 2;
  } else if (position === "right-source") {
    x = source.x + source.width + gap;
    y = source.y + (source.height - height) / 2;
  } else if (position === "top-center") {
    x = area.x + (area.width - width) / 2;
    y = area.y + 24 + index * (height + gap);
  } else if (position === "custom") {
    // Preserve the legacy custom-position contract: offsets are measured from
    // the work area's top-left corner.
    x = area.x;
    y = area.y;
  }

  x += finite(style.offsetX);
  y += finite(style.offsetY) + (position === "near-source" ? (index % 3) * 8 : 0);

  // Prefer the opposite side before clamping source-relative overlays.
  if (["near-source", "below-source"].includes(position) && y + height > area.y + area.height) {
    y = source.y - height - gap + finite(style.offsetY);
  } else if (position === "above-source" && y < area.y) {
    y = source.y + source.height + gap + finite(style.offsetY);
  } else if (position === "left-source" && x < area.x) {
    x = source.x + source.width + gap + finite(style.offsetX);
  } else if (position === "right-source" && x + width > area.x + area.width) {
    x = source.x - width - gap + finite(style.offsetX);
  }

  return {
    x: Math.round(clamp(x, area.x, area.x + area.width - width)),
    y: Math.round(clamp(y, area.y, area.y + area.height - height)),
    width: Math.round(width),
    height: Math.round(height)
  };
}

module.exports = { POSITION_VALUES, calculateOverlayBounds };
