const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { WindowPositionStore, visiblePosition } = require("../src/windows/result/window-position-store");

test("result position persists and falls back when its display is gone", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "translator-position-"));
  const store = new WindowPositionStore(path.join(directory, "position.json"));
  store.save({ x: 1400, y: 500 });
  assert.deepEqual(store.load(), { x: 1400, y: 500 });
  const fallback = { x: 100, y: 100 };
  assert.deepEqual(visiblePosition(store.load(), [{ workArea: { x: 0, y: 0, width: 800, height: 600 } }], { width: 500, height: 300 }, fallback), fallback);
  fs.rmSync(directory, { recursive: true, force: true });
});
