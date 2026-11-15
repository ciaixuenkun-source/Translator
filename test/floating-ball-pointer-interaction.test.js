const test = require("node:test");
const assert = require("node:assert/strict");
const { BALL_STATES } = require("../src/services/floating-ball/docked-ball-state-machine");
const {
  createPointerPresenceMonitor,
  pointIsInsideBounds,
  shouldCollapseExpandedMenu,
  stablePointerBounds
} = require("../src/services/floating-ball/pointer-interaction");

test("global pointer monitoring survives a missing Electron mouseleave event", () => {
  let callback = null;
  const samples = [];
  const monitor = createPointerPresenceMonitor({
    sample() {
      samples.push("sample");
    },
    setIntervalFn(fn, delay) {
      callback = fn;
      assert.equal(delay, 80);
      return 7;
    },
    clearIntervalFn(id) {
      assert.equal(id, 7);
      callback = null;
    }
  });

  monitor.start();
  monitor.start();
  assert.equal(monitor.running, true);
  assert.equal(samples.length, 1);

  callback();
  callback();
  assert.equal(samples.length, 3);

  monitor.stop();
  assert.equal(monitor.running, false);
  assert.equal(callback, null);
});

test("a global outside sample collapses a stale expanded menu after reveal", () => {
  assert.equal(shouldCollapseExpandedMenu({
    inside: false,
    viewState: "expanded",
    dragging: false
  }), true);
  assert.equal(shouldCollapseExpandedMenu({
    inside: true,
    viewState: "expanded",
    dragging: false
  }), false);
  assert.equal(shouldCollapseExpandedMenu({
    inside: false,
    viewState: "expanded",
    dragging: true
  }), false);
  assert.equal(shouldCollapseExpandedMenu({
    inside: false,
    viewState: "collapsed",
    dragging: false
  }), false);
});

test("the temporary animation stage is not the character hover region", () => {
  const animationStage = { x: 100, y: 100, width: 220, height: 190 };
  const collapsedBall = { x: 244, y: 157, width: 76, height: 76 };
  const bounds = stablePointerBounds({
    windowBounds: animationStage,
    ballState: BALL_STATES.HIDING,
    collapsedAnimationBounds: collapsedBall
  });

  assert.deepEqual(bounds, collapsedBall);
  assert.equal(pointIsInsideBounds({ x: 150, y: 150 }, bounds), false);
  assert.equal(pointIsInsideBounds({ x: 280, y: 180 }, bounds), true);
});

test("visible and hidden stable states use their actual stable windows", () => {
  for (const ballState of [BALL_STATES.DOCKED_VISIBLE, BALL_STATES.DOCKED_HIDDEN]) {
    const windowBounds = { x: 500, y: 300, width: 64, height: 68 };
    assert.equal(stablePointerBounds({ windowBounds, ballState }), windowBounds);
    assert.equal(pointIsInsideBounds({ x: 520, y: 320 }, windowBounds), true);
    assert.equal(pointIsInsideBounds({ x: 700, y: 320 }, windowBounds), false);
  }
});

test("resize-generated coordinates cannot replace the real global cursor point", () => {
  const stableBounds = { x: 1460, y: 250, width: 76, height: 76 };
  const globalCursor = { x: 1408, y: 345 };
  const syntheticEventPoint = { x: 1502, y: 281 };

  assert.equal(pointIsInsideBounds(globalCursor, stableBounds), false);
  assert.equal(pointIsInsideBounds(syntheticEventPoint, stableBounds), true);
});
