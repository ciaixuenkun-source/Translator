const test = require("node:test");
const assert = require("node:assert/strict");
const { edgeTrackBounds } = require("../src/services/floating-ball/edge-track-drag");

const displayBounds = { x: 0, y: 0, width: 1920, height: 1080 };
test("top and bottom game peeks move only horizontally", () => {
  for (const edge of ["top", "bottom"]) {
    const result = edgeTrackBounds({ startBounds: { x: 500, y: 0, width: 64, height: 68 }, startPoint: { x: 500, y: 10 }, point: { x: 700, y: 500 }, displayBounds, edge });
    assert.equal(result.x, 700);
    assert.equal(result.y, 0);
  }
});
test("left and right game peeks move only vertically and respect corners", () => {
  for (const edge of ["left", "right"]) {
    const result = edgeTrackBounds({ startBounds: { x: 0, y: 400, width: 64, height: 68 }, startPoint: { x: 10, y: 400 }, point: { x: 900, y: -500 }, displayBounds, edge });
    assert.equal(result.x, 0);
    assert.equal(result.y, 24);
  }
});
