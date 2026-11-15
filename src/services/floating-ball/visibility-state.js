const { DOCK_EDGES, DISPLAY_MODES, normalizeDisplayMode, normalizeDockEdge } = require("./dock-geometry");
const { BALL_STATES } = require("./docked-ball-state-machine");

const FLOATING_UI_VISIBILITY_ANIMATION_MS = 300;
const EDGE_ANIMATION_OFFSET = 22;

function copyBounds(bounds = {}) {
  return {
    x: Math.round(Number(bounds.x) || 0),
    y: Math.round(Number(bounds.y) || 0),
    width: Math.max(1, Math.round(Number(bounds.width) || 1)),
    height: Math.max(1, Math.round(Number(bounds.height) || 1))
  };
}

function createFloatingUiSnapshot({
  bounds,
  edge,
  displayMode,
  viewState,
  ballState,
  docked
}) {
  return {
    bounds: copyBounds(bounds),
    edge: normalizeDockEdge(edge),
    displayMode: normalizeDisplayMode(displayMode),
    viewState: viewState === "expanded" ? "expanded" : "collapsed",
    ballState: Object.values(BALL_STATES).includes(ballState)
      ? ballState
      : BALL_STATES.FLOATING,
    docked: Boolean(docked)
  };
}

function animationOffsetForEdge(edge, docked) {
  if (!docked) return { x: 0, y: 0 };
  if (edge === DOCK_EDGES.LEFT) return { x: -EDGE_ANIMATION_OFFSET, y: 0 };
  if (edge === DOCK_EDGES.RIGHT) return { x: EDGE_ANIMATION_OFFSET, y: 0 };
  if (edge === DOCK_EDGES.TOP) return { x: 0, y: -EDGE_ANIMATION_OFFSET };
  if (edge === DOCK_EDGES.BOTTOM) return { x: 0, y: EDGE_ANIMATION_OFFSET };
  return { x: 0, y: 0 };
}

function createVisibilityAnimationPayload(type, snapshot, token) {
  const safeSnapshot = createFloatingUiSnapshot(snapshot);
  return {
    type,
    token,
    durationMs: FLOATING_UI_VISIBILITY_ANIMATION_MS,
    edge: safeSnapshot.edge,
    docked: safeSnapshot.docked,
    offset: animationOffsetForEdge(safeSnapshot.edge, safeSnapshot.docked)
  };
}

function snapshotNeedsHiddenBoundsRestore(snapshot) {
  return snapshot?.ballState === BALL_STATES.DOCKED_HIDDEN ||
    snapshot?.displayMode === DISPLAY_MODES.QUIET_EDGE;
}

module.exports = {
  FLOATING_UI_VISIBILITY_ANIMATION_MS,
  animationOffsetForEdge,
  createFloatingUiSnapshot,
  createVisibilityAnimationPayload,
  snapshotNeedsHiddenBoundsRestore
};
