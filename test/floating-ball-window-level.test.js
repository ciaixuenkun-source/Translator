const test = require("node:test");
const assert = require("node:assert/strict");
const {
  FLOATING_BALL_WINDOW_LEVEL,
  applyFloatingBallWindowLevel
} = require("../src/services/floating-ball/window-level");

test("floating ball uses the topmost screen-saver window level", () => {
  const calls = [];
  let movedTop = false;
  applyFloatingBallWindowLevel({
    isDestroyed: () => false,
    setAlwaysOnTop: (...args) => calls.push(args),
    moveTop: () => { movedTop = true; }
  });

  assert.equal(FLOATING_BALL_WINDOW_LEVEL, "screen-saver");
  assert.deepEqual(calls, [[true, "screen-saver"]]);
  assert.equal(movedTop, true);
});

test("floating ball window level avoids destroyed windows", () => {
  let called = false;
  applyFloatingBallWindowLevel({
    isDestroyed: () => true,
    setAlwaysOnTop: () => { called = true; }
  });

  assert.equal(called, false);
});

test("floating ball window level never raises an invisible window", () => {
  const calls = [];
  applyFloatingBallWindowLevel({
    isDestroyed: () => false,
    isVisible: () => false,
    setAlwaysOnTop: (...args) => calls.push(["level", ...args]),
    moveTop: () => calls.push(["moveTop"])
  });

  assert.deepEqual(calls, []);
});

test("main does not reapply the topmost level merely because the floating window loses focus", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const main = fs.readFileSync(path.join(__dirname, "..", "src", "main.js"), "utf8");

  assert.doesNotMatch(
    main,
    /mainWindow\.on\("blur",[\s\S]*setImmediate\(maintainFloatingBallWindowLevel\)/
  );
});

test("pointer monitoring does not periodically refresh the floating window level", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const main = fs.readFileSync(path.join(__dirname, "..", "src", "main.js"), "utf8");

  assert.doesNotMatch(main, /lastWindowLevelRefreshAt/);
  assert.doesNotMatch(
    main,
    /function syncDockedBallPointerPresence\(\)[\s\S]*?maintainFloatingBallWindowLevel\(\)[\s\S]*?return inside;/
  );
});

test("main applies the floating window level at explicit lifecycle transitions", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const main = fs.readFileSync(path.join(__dirname, "..", "src", "main.js"), "utf8");

  assert.match(
    main,
    /mainWindow\.once\("ready-to-show",[\s\S]*mainWindow\.showInactive\(\);[\s\S]*maintainFloatingBallWindowLevel\(\)/
  );
  assert.match(
    main,
    /async function showFloatingUi[\s\S]*mainWindow\.showInactive\(\);[\s\S]*applyFloatingBallWindowLevel\(mainWindow\)/
  );
  assert.match(
    main,
    /function restoreFloatingBallAfterCapture[\s\S]*mainWindow\.showInactive\(\);[\s\S]*dockedBall\?\.resume\(\{ deferHide: true \}\)/
  );
  assert.match(
    main,
    /function handleDockedBallStateChange[\s\S]*maintainFloatingBallWindowLevel\(\)/
  );
});

test("capture suspends pointer monitoring and guards explicit window-level changes", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const main = fs.readFileSync(path.join(__dirname, "..", "src", "main.js"), "utf8");

  assert.match(main, /floatingBallCaptureActive = true;[\s\S]*pointerPresenceMonitor\?\.stop\(\)/);
  assert.match(main, /function maintainFloatingBallWindowLevel\(\)[\s\S]*floatingBallCaptureActive[\s\S]*floatingUiHidden[\s\S]*dockedBall\?\.suspended[\s\S]*!mainWindow\.isVisible\(\)/);
  assert.doesNotMatch(main, /mainWindow\.on\("blur"/);
});

test("capture restore preserves complete hiding and resumes monitoring only for visible UI", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const main = fs.readFileSync(path.join(__dirname, "..", "src", "main.js"), "utf8");

  assert.match(main, /floatingBallCaptureActive = false;[\s\S]*setIgnoreMouseEvents\(false\);[\s\S]*if \(floatingUiHidden\) \{[\s\S]*return;[\s\S]*showInactive\(\)[\s\S]*resume\(\{ deferHide: true \}\)[\s\S]*syncDockedBallPointerPresence\(\)[\s\S]*pointerPresenceMonitor\?\.start\(\)/);
});

test("capture restore never raises or focuses the floating ball", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const main = fs.readFileSync(path.join(__dirname, "..", "src", "main.js"), "utf8");
  const restore = main.match(/function restoreFloatingBallAfterCapture\(\) \{[\s\S]*?\n\}/)?.[0] || "";

  assert.doesNotMatch(restore, /maintainFloatingBallWindowLevel|applyFloatingBallWindowLevel/);
  assert.doesNotMatch(restore, /\.moveTop\(|\.focus\(|\.show\(/);
  assert.match(restore, /\.showInactive\(\)/);
});
