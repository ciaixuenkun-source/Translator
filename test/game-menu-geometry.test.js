const test = require("node:test");
const assert = require("node:assert/strict");
const { gameMenuBounds } = require("../src/windows/game-menu/geometry");
const display = { bounds: { x: 100, y: -40, width: 1280, height: 720 } };
const size = { width: 224, height: 238 };

test("game menu expands toward the display interior for every edge", () => {
  const left = gameMenuBounds({ x: 100, y: 100, width: 64, height: 68 }, display, "left", size);
  const right = gameMenuBounds({ x: 1316, y: 100, width: 64, height: 68 }, display, "right", size);
  const top = gameMenuBounds({ x: 500, y: -40, width: 64, height: 68 }, display, "top", size);
  const bottom = gameMenuBounds({ x: 500, y: 612, width: 64, height: 68 }, display, "bottom", size);
  assert.ok(left.x > 100);
  assert.ok(right.x < 1316);
  assert.ok(top.y > -40);
  assert.ok(bottom.y < 612);
});

test("game menu is clamped to the current physical display bounds", () => {
  const result = gameMenuBounds({ x: 100, y: -40, width: 64, height: 68 }, display, "right", size);
  assert.ok(result.x >= display.bounds.x);
  assert.ok(result.y >= display.bounds.y);
  assert.ok(result.x + result.width <= display.bounds.x + display.bounds.width);
  assert.ok(result.y + result.height <= display.bounds.y + display.bounds.height);
});
