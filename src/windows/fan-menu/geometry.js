const MENU_SIZE = Object.freeze({ width: 300, height: 300 });
const BUTTON_SIZE = 57;
const MENU_SAFE_MARGIN = 14;
const SCREEN_SAFE_MARGIN = 8;

const FAN_LAYOUT_OFFSETS = Object.freeze({
  "central-surround": Object.freeze([
    Object.freeze({ x: -72, y: -72 }),
    Object.freeze({ x: 72, y: -72 }),
    Object.freeze({ x: -72, y: 72 }),
    Object.freeze({ x: 72, y: 72 })
  ]),
  "edge-left-fan": Object.freeze([
    Object.freeze({ x: 70, y: -96 }),
    Object.freeze({ x: 116, y: -34 }),
    Object.freeze({ x: 116, y: 34 }),
    Object.freeze({ x: 70, y: 96 })
  ]),
  "edge-right-fan": Object.freeze([
    Object.freeze({ x: -70, y: -96 }),
    Object.freeze({ x: -116, y: -34 }),
    Object.freeze({ x: -116, y: 34 }),
    Object.freeze({ x: -70, y: 96 })
  ]),
  "edge-top-fan": Object.freeze([
    Object.freeze({ x: -96, y: 70 }),
    Object.freeze({ x: -34, y: 116 }),
    Object.freeze({ x: 34, y: 116 }),
    Object.freeze({ x: 96, y: 70 })
  ]),
  "edge-bottom-fan": Object.freeze([
    Object.freeze({ x: -96, y: -70 }),
    Object.freeze({ x: -34, y: -116 }),
    Object.freeze({ x: 34, y: -116 }),
    Object.freeze({ x: 96, y: -70 })
  ]),
  "corner-top-left-grid": Object.freeze([
    Object.freeze({ x: 72, y: 72 }),
    Object.freeze({ x: 133, y: 72 }),
    Object.freeze({ x: 72, y: 133 }),
    Object.freeze({ x: 133, y: 133 })
  ]),
  "corner-top-right-grid": Object.freeze([
    Object.freeze({ x: -133, y: 72 }),
    Object.freeze({ x: -72, y: 72 }),
    Object.freeze({ x: -133, y: 133 }),
    Object.freeze({ x: -72, y: 133 })
  ]),
  "corner-bottom-left-grid": Object.freeze([
    Object.freeze({ x: 72, y: -133 }),
    Object.freeze({ x: 133, y: -133 }),
    Object.freeze({ x: 72, y: -72 }),
    Object.freeze({ x: 133, y: -72 })
  ]),
  "corner-bottom-right-grid": Object.freeze([
    Object.freeze({ x: -133, y: -133 }),
    Object.freeze({ x: -72, y: -133 }),
    Object.freeze({ x: -133, y: -72 }),
    Object.freeze({ x: -72, y: -72 })
  ])
});

const EDGE_FAN_LAYOUT = Object.freeze({
  left: "edge-left-fan",
  right: "edge-right-fan",
  top: "edge-top-fan",
  bottom: "edge-bottom-fan"
});

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function displayArea(display) {
  return display.workArea || display.bounds;
}

function anchorCenter(anchor) {
  return {
    x: anchor.x + anchor.width / 2,
    y: anchor.y + anchor.height / 2
  };
}

function fanMenuBounds(anchor, display, size = MENU_SIZE) {
  const area = displayArea(display);
  const center = anchorCenter(anchor);
  return {
    x: Math.round(clamp(center.x - size.width / 2, area.x, area.x + area.width - size.width)),
    y: Math.round(clamp(center.y - size.height / 2, area.y, area.y + area.height - size.height)),
    ...size
  };
}

function anchorInMenu(anchor, menuBounds) {
  const center = anchorCenter(anchor);
  return {
    x: Math.round(center.x - menuBounds.x),
    y: Math.round(center.y - menuBounds.y)
  };
}

function fanMenuOffsets(layout = "central-surround") {
  return FAN_LAYOUT_OFFSETS[layout] || FAN_LAYOUT_OFFSETS["central-surround"];
}

function layoutFitsWorkArea(anchor, display, layout) {
  const area = displayArea(display);
  const center = anchorCenter(anchor);
  const radius = BUTTON_SIZE / 2;
  return fanMenuOffsets(layout).every((offset) => {
    const x = center.x + offset.x;
    const y = center.y + offset.y;
    return x - radius >= area.x + SCREEN_SAFE_MARGIN
      && x + radius <= area.x + area.width - SCREEN_SAFE_MARGIN
      && y - radius >= area.y + SCREEN_SAFE_MARGIN
      && y + radius <= area.y + area.height - SCREEN_SAFE_MARGIN;
  });
}

function cornerLayout(anchor, display) {
  const area = displayArea(display);
  const center = anchorCenter(anchor);
  const horizontal = center.x < area.x + area.width / 2 ? "left" : "right";
  const vertical = center.y < area.y + area.height / 2 ? "top" : "bottom";
  return `corner-${vertical}-${horizontal}-grid`;
}

function fanMenuLayout(edge = "floating", anchor = null, display = null) {
  if (!anchor || !display || !EDGE_FAN_LAYOUT[edge]) return "central-surround";
  const ideal = EDGE_FAN_LAYOUT[edge];
  return layoutFitsWorkArea(anchor, display, ideal) ? ideal : cornerLayout(anchor, display);
}

function fanMenuNudge(anchor, layout = "central-surround", size = MENU_SIZE) {
  const offsets = fanMenuOffsets(layout);
  const radius = BUTTON_SIZE / 2;
  const minX = Math.min(...offsets.map((offset) => anchor.x + offset.x));
  const maxX = Math.max(...offsets.map((offset) => anchor.x + offset.x));
  const minY = Math.min(...offsets.map((offset) => anchor.y + offset.y));
  const maxY = Math.max(...offsets.map((offset) => anchor.y + offset.y));
  const allowedMin = MENU_SAFE_MARGIN + radius;
  const allowedMaxX = size.width - MENU_SAFE_MARGIN - radius;
  const allowedMaxY = size.height - MENU_SAFE_MARGIN - radius;
  return {
    x: clamp(0, allowedMin - minX, allowedMaxX - maxX),
    y: clamp(0, allowedMin - minY, allowedMaxY - maxY)
  };
}

module.exports = {
  BUTTON_SIZE,
  FAN_LAYOUT_OFFSETS,
  MENU_SAFE_MARGIN,
  MENU_SIZE,
  SCREEN_SAFE_MARGIN,
  anchorInMenu,
  fanMenuBounds,
  fanMenuLayout,
  fanMenuNudge,
  fanMenuOffsets,
  layoutFitsWorkArea
};
