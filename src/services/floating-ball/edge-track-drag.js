const { DOCK_EDGES } = require("./dock-geometry");

function clamp(value, min, max) { return Math.min(Math.max(value, min), max); }

function edgeTrackBounds({ startBounds, startPoint, point, displayBounds, edge, cornerMargin = 24 }) {
  const next = { ...startBounds };
  const minX = displayBounds.x + cornerMargin;
  const maxX = displayBounds.x + displayBounds.width - startBounds.width - cornerMargin;
  const minY = displayBounds.y + cornerMargin;
  const maxY = displayBounds.y + displayBounds.height - startBounds.height - cornerMargin;
  if (edge === DOCK_EDGES.TOP || edge === DOCK_EDGES.BOTTOM) {
    next.x = clamp(startBounds.x + point.x - startPoint.x, minX, maxX);
  } else {
    next.y = clamp(startBounds.y + point.y - startPoint.y, minY, maxY);
  }
  return next;
}

module.exports = { edgeTrackBounds };
