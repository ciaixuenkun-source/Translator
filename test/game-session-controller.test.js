const test = require("node:test");
const assert = require("node:assert/strict");
const { GameSessionController } = require("../src/services/game-mode/game-session-controller");
const { gameRuntimeState } = require("../src/services/game-mode/game-runtime-state");
const fs = require("node:fs");
const path = require("node:path");

function fakeCapture() {
  return {
    active: false, capturing: false, cancelled: [],
    isActive() { return this.active; },
    isCapturing() { return this.capturing; },
    async start(options) {
      this.capturing = true;
      this.options = options;
      return true;
    },
    cancel(reason) { this.capturing = false; this.cancelled.push(reason); },
    cancelRecognition(reason) { this.active = false; this.cancelled.push(reason); },
    addContinuousRegion(region) { (this.regions ||= []).push(region); return true; },
    pauseContinuousRegions() { this.paused = true; },
    resumeContinuousRegions() { this.paused = false; },
    clearContinuousRegions() { this.regions = []; },
    async captureFullScreen() { this.active = true; await new Promise((resolve) => { this.finishFull = resolve; }); this.active = false; }
  };
}

test("game region selection toggles cancellation and retains at most three metadata entries", async () => {
  const capture = fakeCapture();
  const controller = new GameSessionController({ regionCapture: capture });
  await controller.toggleRegionSelection();
  assert.equal(controller.snapshot().selectionActive, true);
  await controller.toggleRegionSelection();
  assert.deepEqual(capture.cancelled, ["game-region-toggle"]);

  for (let index = 0; index < 3; index += 1) {
    capture.capturing = false;
    capture.active = false;
    await controller.toggleRegionSelection();
    capture.options.onSelectionComplete({
      displayId: "1",
      screenRect: { x: index, y: 0, width: 10, height: 10 },
      pixelRect: { x: index, y: 0, width: 20, height: 20 }
    });
    capture.options.onFinished();
    capture.capturing = false;
    capture.options.onTaskStatus("recognized");
  }
  assert.equal(controller.snapshot().regions.length, 3);
  assert.equal((await controller.toggleRegionSelection()).paused, true);
  assert.equal(controller.snapshot().continuousPaused, true);
  assert.equal((await controller.toggleRegionSelection()).resumed, true);
  assert.equal(controller.snapshot().continuousPaused, false);
});

test("repeated fullscreen action cancels the current recognition task", async () => {
  const capture = fakeCapture();
  const controller = new GameSessionController({ regionCapture: capture });
  const pending = controller.toggleFullscreen();
  await new Promise((resolve) => setImmediate(resolve));
  const result = await controller.toggleFullscreen();
  assert.equal(result.cancelled, true);
  assert.ok(capture.cancelled.includes("game-fullscreen-toggle"));
  capture.finishFull();
  await pending;
});

test("clear all cancels current work and removes every temporary region", async () => {
  const capture = fakeCapture();
  const controller = new GameSessionController({ regionCapture: capture });
  await controller.toggleRegionSelection();
  capture.options.onSelectionComplete({ displayId: "1", screenRect: {}, pixelRect: {} });
  controller.clearAll();
  assert.equal(controller.snapshot().regions.length, 0);
  assert.equal(controller.snapshot().selectionActive, false);
});

test("clear all is safe when no game regions exist", () => {
  const capture = fakeCapture();
  const controller = new GameSessionController({ regionCapture: capture });

  assert.doesNotThrow(() => controller.clearAll());
  assert.equal(controller.snapshot().regions.length, 0);
  assert.equal(controller.snapshot().fullscreenActive, false);
  assert.equal(controller.snapshot().selectionActive, false);
});

test("Delete-style clear keeps game runtime mode while clearing paused region state", async () => {
  const capture = fakeCapture();
  const snapshots = [];
  const controller = new GameSessionController({ regionCapture: capture, onRegionStateChange: (value) => snapshots.push(value) });
  await controller.toggleRegionSelection();
  capture.options.onSelectionComplete({ displayId: "1", screenRect: {}, pixelRect: {} });
  controller.pauseContinuous();
  controller.clearAll();
  const state = gameRuntimeState("game", controller.snapshot());
  assert.equal(state.mode, "game");
  assert.equal(state.gameRegionsActive, false);
  assert.equal(state.continuousPaused, false);
  assert.equal(snapshots.at(-1).regions.length, 0);
});

test("Delete action resynchronizes game UI without invoking generic floating-ball reveal", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/main.js"), "utf8");
  const clearBranch = source.match(/if \(action === "gameClearRegions"\) \{[\s\S]*?\n  \}/)?.[0] || "";
  assert.match(clearBranch, /synchronizeRuntimeModeState/);
  assert.match(clearBranch, /sendFloatingBallNotice/);
  assert.doesNotMatch(clearBranch, /setRuntimeMode|showFloatingBall/);
});
