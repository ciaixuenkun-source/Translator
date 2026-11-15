const { BALL_STATES } = require("./docked-ball-state-machine");

function pointIsInsideBounds(point, bounds) {
  if (!point || !bounds) return false;
  return point.x >= bounds.x &&
    point.x < bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y < bounds.y + bounds.height;
}

function stablePointerBounds({
  windowBounds,
  ballState,
  collapsedAnimationBounds = null
}) {
  if (
    [BALL_STATES.HIDING, BALL_STATES.REVEALING].includes(ballState) &&
    collapsedAnimationBounds
  ) {
    return collapsedAnimationBounds;
  }
  return windowBounds;
}

function createPointerPresenceMonitor({
  sample,
  intervalMs = 80,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval
}) {
  let timer = null;

  return {
    start() {
      if (timer !== null) return;
      sample();
      timer = setIntervalFn(sample, intervalMs);
    },
    stop() {
      if (timer === null) return;
      clearIntervalFn(timer);
      timer = null;
    },
    get running() {
      return timer !== null;
    }
  };
}

function shouldCollapseExpandedMenu({ inside, viewState, dragging }) {
  return !inside && viewState === "expanded" && !dragging;
}

module.exports = {
  createPointerPresenceMonitor,
  pointIsInsideBounds,
  shouldCollapseExpandedMenu,
  stablePointerBounds
};
