const test = require("node:test");
const assert = require("node:assert/strict");
const {
  collapsedBoundsFromAnimationVisual,
  dragThresholdReached,
  findAnimationHitRegion,
  normalizeAnimationHitPayload,
  screenPointToLocal
} = require("../src/services/floating-ball/animation-drag");

test("animation hit regions are clipped to the renderer viewport", () => {
  const payload = normalizeAnimationHitPayload({
    viewport: { width: 220, height: 190 },
    regions: [
      { name: "doll", x: -10, y: 20, width: 50, height: 60 },
      { name: "offscreen", x: 230, y: 20, width: 10, height: 10 },
      { name: "invalid", x: 0, y: 0, width: 0, height: 10 }
    ]
  });

  assert.deepEqual(payload, {
    viewport: { width: 220, height: 190 },
    regions: [{ name: "doll", x: 0, y: 20, width: 40, height: 60 }]
  });
});

test("screen hit testing respects BrowserWindow to CSS pixel scaling", () => {
  const windowBounds = { x: 100, y: 200, width: 275, height: 237.5 };
  const viewport = { width: 220, height: 190 };
  const regions = [
    { name: "bag", x: 80, y: 100, width: 64, height: 64 },
    { name: "doll", x: 100, y: 40, width: 40, height: 70 }
  ];
  const local = screenPointToLocal({ x: 250, y: 275 }, windowBounds, viewport);

  assert.deepEqual(local, { x: 120, y: 60 });
  assert.equal(findAnimationHitRegion({
    point: { x: 250, y: 275 },
    windowBounds,
    viewport,
    regions
  }).name, "doll");
  assert.equal(findAnimationHitRegion({
    point: { x: 110, y: 210 },
    windowBounds,
    viewport,
    regions
  }), null);
});

test("animation drag takeover keeps the visible visual center stationary", () => {
  const result = collapsedBoundsFromAnimationVisual({
    windowBounds: { x: 100, y: 200, width: 220, height: 190 },
    viewport: { width: 220, height: 190 },
    visualBounds: { x: 50, y: 20, width: 48, height: 60 },
    displayBounds: { x: 0, y: 0, width: 1920, height: 1080 },
    collapsedSize: { width: 76, height: 76 },
    ballSize: 64,
    ballTop: 6
  });

  assert.deepEqual(result, { x: 136, y: 212, width: 76, height: 76 });
  assert.deepEqual(
    { x: result.x + 6 + 32, y: result.y + 6 + 32 },
    { x: 174, y: 250 }
  );
});

test("animation drag takeover remains inside the physical display", () => {
  const result = collapsedBoundsFromAnimationVisual({
    windowBounds: { x: -1920, y: 0, width: 220, height: 190 },
    viewport: { width: 220, height: 190 },
    visualBounds: { x: 0, y: 0, width: 20, height: 20 },
    displayBounds: { x: -1920, y: 0, width: 1920, height: 1080 }
  });

  assert.equal(result.x, -1920);
  assert.equal(result.y, 0);
});

test("animation drag takeover preserves the pointer grab ratio", () => {
  const result = collapsedBoundsFromAnimationVisual({
    windowBounds: { x: 100, y: 200, width: 220, height: 190 },
    viewport: { width: 220, height: 190 },
    visualBounds: { x: 50, y: 20, width: 40, height: 80 },
    grabPoint: { x: 180, y: 240 },
    collapsedSize: { width: 76, height: 76 },
    ballSize: 64,
    ballTop: 6
  });

  assert.deepEqual(result, { x: 126, y: 218, width: 76, height: 76 });
  assert.deepEqual(
    { x: result.x + 6 + 0.75 * 64, y: result.y + 6 + 0.25 * 64 },
    { x: 180, y: 240 }
  );
});

test("animation drag starts only after the four pixel threshold", () => {
  assert.equal(dragThresholdReached({ x: 10, y: 10 }, { x: 13, y: 12 }), false);
  assert.equal(dragThresholdReached({ x: 10, y: 10 }, { x: 14, y: 10 }), true);
});
