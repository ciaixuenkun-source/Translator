const test = require("node:test");
const assert = require("node:assert/strict");
const { easeInOutCubic, interpolateBounds } = require("../src/services/floating-ball/window-motion");

test("right-click snap interpolation starts and ends at exact stable bounds", () => {
  const from = { x: 500, y: 300, width: 76, height: 76 };
  const to = { x: 0, y: 300, width: 76, height: 76 };
  assert.deepEqual(interpolateBounds(from, to, 0), from);
  assert.deepEqual(interpolateBounds(from, to, 1), to);
  assert.equal(easeInOutCubic(0.5), 0.5);
});

test("right-click snap movement is monotonic and keeps mascot size stable", () => {
  const from = { x: 500, y: 300, width: 76, height: 76 };
  const to = { x: 0, y: 300, width: 76, height: 76 };
  const frames = [0, 0.25, 0.5, 0.75, 1].map((progress) => interpolateBounds(from, to, progress));
  for (let index = 1; index < frames.length; index += 1) {
    assert.ok(frames[index].x <= frames[index - 1].x);
    assert.equal(frames[index].width, 76);
    assert.equal(frames[index].height, 76);
  }
});
