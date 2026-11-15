const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DOCK_EDGES,
  DISPLAY_MODES
} = require("../src/services/floating-ball/dock-geometry");
const { BALL_STATES } = require("../src/services/floating-ball/docked-ball-state-machine");
const {
  FLOATING_UI_VISIBILITY_ANIMATION_MS,
  animationOffsetForEdge,
  createFloatingUiSnapshot,
  createVisibilityAnimationPayload,
  snapshotNeedsHiddenBoundsRestore
} = require("../src/services/floating-ball/visibility-state");

test("floating ui snapshot preserves dock edge, display mode, position and dock state", () => {
  const snapshot = createFloatingUiSnapshot({
    bounds: { x: 20.4, y: 50.6, width: 76, height: 76 },
    edge: DOCK_EDGES.BOTTOM,
    displayMode: DISPLAY_MODES.QUIET_EDGE,
    viewState: "expanded",
    ballState: BALL_STATES.DOCKED_HIDDEN,
    docked: true
  });

  assert.deepEqual(snapshot.bounds, { x: 20, y: 51, width: 76, height: 76 });
  assert.equal(snapshot.edge, DOCK_EDGES.BOTTOM);
  assert.equal(snapshot.displayMode, DISPLAY_MODES.QUIET_EDGE);
  assert.equal(snapshot.viewState, "expanded");
  assert.equal(snapshot.ballState, BALL_STATES.DOCKED_HIDDEN);
  assert.equal(snapshot.docked, true);
});

test("visibility animation moves toward the dock edge and stays in place when floating", () => {
  assert.deepEqual(animationOffsetForEdge(DOCK_EDGES.LEFT, true), { x: -22, y: 0 });
  assert.deepEqual(animationOffsetForEdge(DOCK_EDGES.RIGHT, true), { x: 22, y: 0 });
  assert.deepEqual(animationOffsetForEdge(DOCK_EDGES.TOP, true), { x: 0, y: -22 });
  assert.deepEqual(animationOffsetForEdge(DOCK_EDGES.BOTTOM, true), { x: 0, y: 22 });
  assert.deepEqual(animationOffsetForEdge(DOCK_EDGES.BOTTOM, false), { x: 0, y: 0 });
});

test("visibility animation payload keeps token and short duration", () => {
  const payload = createVisibilityAnimationPayload("hide", {
    bounds: { x: 0, y: 0, width: 76, height: 76 },
    edge: DOCK_EDGES.RIGHT,
    displayMode: DISPLAY_MODES.FULL,
    viewState: "collapsed",
    ballState: BALL_STATES.DOCKED_VISIBLE,
    docked: true
  }, 9);

  assert.equal(payload.type, "hide");
  assert.equal(payload.token, 9);
  assert.equal(payload.durationMs, FLOATING_UI_VISIBILITY_ANIMATION_MS);
  assert.deepEqual(payload.offset, { x: 22, y: 0 });
});

test("quiet edge and docked-hidden snapshots restore through hidden bounds", () => {
  assert.equal(snapshotNeedsHiddenBoundsRestore({
    displayMode: DISPLAY_MODES.QUIET_EDGE,
    ballState: BALL_STATES.FLOATING
  }), true);
  assert.equal(snapshotNeedsHiddenBoundsRestore({
    displayMode: DISPLAY_MODES.FULL,
    ballState: BALL_STATES.DOCKED_HIDDEN
  }), true);
  assert.equal(snapshotNeedsHiddenBoundsRestore({
    displayMode: DISPLAY_MODES.FULL,
    ballState: BALL_STATES.FLOATING
  }), false);
});
