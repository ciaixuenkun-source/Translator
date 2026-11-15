const test = require("node:test");
const assert = require("node:assert/strict");
const { secondInstanceAction } = require("../src/services/floating-ball/second-instance-policy");
const fs = require("node:fs");
const path = require("node:path");

test("second instance ignores visible full, quiet-edge and automatic hiding", () => {
  assert.equal(secondInstanceAction({ activelyHidden: false, displayMode: "full" }), "ignore");
  assert.equal(secondInstanceAction({ activelyHidden: false, displayMode: "quiet-edge" }), "ignore");
  assert.equal(secondInstanceAction({ activelyHidden: false, autoHidden: true }), "ignore");
});

test("second instance restores user-initiated complete hiding", () => {
  assert.equal(secondInstanceAction({ activelyHidden: true }), "restore");
});

test("main process connects second-instance restore without toggling display mode", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/main.js"), "utf8");
  const handler = source.match(/app\.on\("second-instance"[\s\S]*?\n  \}\);/)?.[0] || "";
  assert.match(handler, /activelyHidden: floatingUiHidden/);
  assert.match(handler, /showFloatingUi\(\)/);
  assert.doesNotMatch(handler, /toggleFloatingUi|setBallDisplayMode|showFloatingBall/);
});
