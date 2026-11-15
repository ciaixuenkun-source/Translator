const FLOATING_BALL_WINDOW_LEVEL = "screen-saver";

function applyFloatingBallWindowLevel(window) {
  if (!window || window.isDestroyed?.()) return;
  if (window.isVisible?.() === false) return;
  window.setAlwaysOnTop(true, FLOATING_BALL_WINDOW_LEVEL);
  window.moveTop?.();
}

module.exports = {
  FLOATING_BALL_WINDOW_LEVEL,
  applyFloatingBallWindowLevel
};
