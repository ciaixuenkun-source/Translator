const DOCK_EDGES = Object.freeze({
  LEFT: "left",
  RIGHT: "right",
  TOP: "top",
  BOTTOM: "bottom"
});

const DISPLAY_MODES = Object.freeze({
  FULL: "full",
  QUIET_EDGE: "quiet-edge"
});

const BOTTOM_DIVE_SIDES = Object.freeze({
  LEFT: "left",
  RIGHT: "right"
});

const ALL_DOCK_EDGES = Object.freeze([
  DOCK_EDGES.LEFT,
  DOCK_EDGES.RIGHT,
  DOCK_EDGES.TOP,
  DOCK_EDGES.BOTTOM
]);

function clamp(value, minimum, maximum) {
  if (maximum < minimum) return minimum;
  return Math.min(Math.max(value, minimum), maximum);
}

function normalizeDockEdge(edge, fallback = DOCK_EDGES.RIGHT) {
  return ALL_DOCK_EDGES.includes(edge) ? edge : fallback;
}

function normalizeDisplayMode(mode) {
  return mode === DISPLAY_MODES.QUIET_EDGE
    ? DISPLAY_MODES.QUIET_EDGE
    : DISPLAY_MODES.FULL;
}

function physicalBounds(display) {
  return display?.bounds || { x: 0, y: 0, width: 0, height: 0 };
}

function cornerSafetyDistance(size, snapThreshold) {
  const shortestSide = Math.min(size.width, size.height);
  return Math.round(clamp(shortestSide * 0.5, 24, snapThreshold));
}

function edgeDistances(bounds, display) {
  const area = physicalBounds(display);
  return {
    left: bounds.x - area.x,
    right: area.x + area.width - (bounds.x + bounds.width),
    top: bounds.y - area.y,
    bottom: area.y + area.height - (bounds.y + bounds.height)
  };
}

function boundsFromDrag(startBounds, startPoint, currentPoint) {
  if (!startBounds || !startPoint || !currentPoint) return startBounds;
  const dx = currentPoint.x - startPoint.x;
  const dy = currentPoint.y - startPoint.y;
  return {
    ...startBounds,
    x: Math.round(startBounds.x + dx),
    y: Math.round(startBounds.y + dy)
  };
}

function chooseDockEdge(bounds, display, {
  threshold = Infinity,
  currentEdge = null
} = {}) {
  const distances = edgeDistances(bounds, display);
  const candidates = ALL_DOCK_EDGES
    .map((edge) => ({ edge, distance: distances[edge], score: Math.abs(distances[edge]) }))
    .filter((candidate) => candidate.distance <= threshold);

  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    if (a.edge === currentEdge) return -1;
    if (b.edge === currentEdge) return 1;
    return ALL_DOCK_EDGES.indexOf(a.edge) - ALL_DOCK_EDGES.indexOf(b.edge);
  });
  return candidates[0].edge;
}

function safeAxisRange(area, edge, size, snapThreshold) {
  const safety = cornerSafetyDistance(size, snapThreshold);
  if (edge === DOCK_EDGES.LEFT || edge === DOCK_EDGES.RIGHT) {
    return {
      minimum: area.y + safety,
      maximum: area.y + area.height - size.height - safety
    };
  }
  return {
    minimum: area.x + safety,
    maximum: area.x + area.width - size.width - safety
  };
}

function snapBoundsToEdge(bounds, display, edge, {
  size = bounds,
  snapThreshold = 60
} = {}) {
  const area = physicalBounds(display);
  const dockEdge = normalizeDockEdge(edge);
  const next = { ...bounds, width: size.width, height: size.height };
  const axis = safeAxisRange(area, dockEdge, size, snapThreshold);

  if (dockEdge === DOCK_EDGES.LEFT) {
    next.x = area.x;
    next.y = clamp(bounds.y, axis.minimum, axis.maximum);
  } else if (dockEdge === DOCK_EDGES.RIGHT) {
    next.x = area.x + area.width - size.width;
    next.y = clamp(bounds.y, axis.minimum, axis.maximum);
  } else if (dockEdge === DOCK_EDGES.TOP) {
    next.x = clamp(bounds.x, axis.minimum, axis.maximum);
    next.y = area.y;
  } else {
    next.x = clamp(bounds.x, axis.minimum, axis.maximum);
    next.y = area.y + area.height - size.height;
  }

  return next;
}

function snapToNearbyEdge(bounds, display, {
  threshold = 60,
  currentEdge = null,
  size = bounds
} = {}) {
  const edge = chooseDockEdge(bounds, display, { threshold, currentEdge });
  if (!edge) return { docked: false, edge: normalizeDockEdge(currentEdge), bounds };
  return {
    docked: true,
    edge,
    bounds: snapBoundsToEdge(bounds, display, edge, {
      size,
      snapThreshold: threshold
    })
  };
}

function snapToNearestEdge(bounds, display, {
  currentEdge = null,
  size = bounds,
  snapThreshold = 60
} = {}) {
  const edge = chooseDockEdge(bounds, display, {
    threshold: Infinity,
    currentEdge
  }) || normalizeDockEdge(currentEdge);
  return {
    edge,
    bounds: snapBoundsToEdge(bounds, display, edge, { size, snapThreshold })
  };
}

function isDocked(bounds, display, {
  tolerance = 8,
  currentEdge = null
} = {}) {
  return Boolean(chooseDockEdge(bounds, display, {
    threshold: tolerance,
    currentEdge
  }));
}

function bottomDiveSideForBounds(bounds, display) {
  const area = physicalBounds(display);
  const centerX = bounds.x + bounds.width / 2;
  const displayCenterX = area.x + area.width / 2;
  return centerX < displayCenterX
    ? BOTTOM_DIVE_SIDES.LEFT
    : BOTTOM_DIVE_SIDES.RIGHT;
}

module.exports = {
  ALL_DOCK_EDGES,
  BOTTOM_DIVE_SIDES,
  DISPLAY_MODES,
  DOCK_EDGES,
  bottomDiveSideForBounds,
  boundsFromDrag,
  chooseDockEdge,
  clamp,
  cornerSafetyDistance,
  edgeDistances,
  isDocked,
  normalizeDisplayMode,
  normalizeDockEdge,
  snapBoundsToEdge,
  snapToNearbyEdge,
  snapToNearestEdge
};
