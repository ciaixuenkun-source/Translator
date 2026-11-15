const test = require("node:test");
const assert = require("node:assert/strict");
const { physicalDisplayRect } = require("../src/services/region-capture/windows-native-capture");

test("maps a primary display to physical pixels", () => {
  assert.deepEqual(physicalDisplayRect({
    bounds: { x: 0, y: 0, width: 1536, height: 864 },
    scaleFactor: 1.25
  }), { x: 0, y: 0, width: 1920, height: 1080 });
});

test("maps uniform-DPI secondary displays and rejects ambiguous mixed DPI", () => {
  const display = { bounds: { x: 1920, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 };
  assert.deepEqual(physicalDisplayRect(display, [
    { bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 },
    display
  ]), { x: 1920, y: 0, width: 1920, height: 1080 });
  assert.equal(physicalDisplayRect(display, [
    { bounds: { x: 0, y: 0, width: 1536, height: 864 }, scaleFactor: 1.25 },
    display
  ]), null);
});
