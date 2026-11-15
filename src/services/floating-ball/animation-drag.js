function finiteNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function normalizeViewport(viewport) {
  const width = finiteNumber(viewport?.width);
  const height = finiteNumber(viewport?.height);
  if (!width || !height || width <= 0 || height <= 0) return null;
  return { width, height };
}

function normalizeLocalRect(rect, viewport = null) {
  const x = finiteNumber(rect?.x);
  const y = finiteNumber(rect?.y);
  const width = finiteNumber(rect?.width);
  const height = finiteNumber(rect?.height);
  if (x === null || y === null || !width || !height || width <= 0 || height <= 0) {
    return null;
  }

  if (!viewport) return { x, y, width, height };
  const left = Math.max(0, x);
  const top = Math.max(0, y);
  const right = Math.min(viewport.width, x + width);
  const bottom = Math.min(viewport.height, y + height);
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function normalizeAnimationHitPayload(payload) {
  const viewport = normalizeViewport(payload?.viewport);
  if (!viewport) return { viewport: null, regions: [] };
  const regions = Array.isArray(payload?.regions)
    ? payload.regions.map((region) => {
      const rect = normalizeLocalRect(region, viewport);
      return rect ? { ...rect, name: String(region.name || "animation") } : null;
    }).filter(Boolean)
    : [];
  return { viewport, regions };
}

function screenPointToLocal(point, windowBounds, viewport) {
  const normalizedViewport = normalizeViewport(viewport);
  if (!point || !windowBounds || !normalizedViewport) return null;
  const scaleX = windowBounds.width / normalizedViewport.width;
  const scaleY = windowBounds.height / normalizedViewport.height;
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) {
    return null;
  }
  return {
    x: (point.x - windowBounds.x) / scaleX,
    y: (point.y - windowBounds.y) / scaleY
  };
}

function findAnimationHitRegion({ point, windowBounds, viewport, regions }) {
  const localPoint = screenPointToLocal(point, windowBounds, viewport);
  if (!localPoint) return null;
  return [...(regions || [])].reverse().find((region) => (
    localPoint.x >= region.x &&
    localPoint.x < region.x + region.width &&
    localPoint.y >= region.y &&
    localPoint.y < region.y + region.height
  )) || null;
}

function collapsedBoundsFromAnimationVisual({
  windowBounds,
  viewport,
  visualBounds,
  grabPoint = null,
  displayBounds,
  collapsedSize = { width: 76, height: 76 },
  ballSize = 64,
  ballTop = 6
}) {
  const normalizedViewport = normalizeViewport(viewport);
  const normalizedVisual = normalizeLocalRect(visualBounds, normalizedViewport);
  if (!windowBounds || !normalizedViewport || !normalizedVisual) return null;

  const scaleX = windowBounds.width / normalizedViewport.width;
  const scaleY = windowBounds.height / normalizedViewport.height;
  const centerX = windowBounds.x + (normalizedVisual.x + normalizedVisual.width / 2) * scaleX;
  const centerY = windowBounds.y + (normalizedVisual.y + normalizedVisual.height / 2) * scaleY;
  const ballLeft = (collapsedSize.width - ballSize) / 2;
  const localGrab = grabPoint
    ? screenPointToLocal(grabPoint, windowBounds, normalizedViewport)
    : null;
  const grabRatioX = localGrab
    ? Math.max(0, Math.min(1, (localGrab.x - normalizedVisual.x) / normalizedVisual.width))
    : 0.5;
  const grabRatioY = localGrab
    ? Math.max(0, Math.min(1, (localGrab.y - normalizedVisual.y) / normalizedVisual.height))
    : 0.5;
  const requested = {
    x: Math.round((localGrab ? grabPoint.x : centerX) - ballLeft - grabRatioX * ballSize),
    y: Math.round((localGrab ? grabPoint.y : centerY) - ballTop - grabRatioY * ballSize),
    width: collapsedSize.width,
    height: collapsedSize.height
  };

  if (!displayBounds) return requested;
  return {
    ...requested,
    x: Math.max(
      displayBounds.x,
      Math.min(requested.x, displayBounds.x + displayBounds.width - requested.width)
    ),
    y: Math.max(
      displayBounds.y,
      Math.min(requested.y, displayBounds.y + displayBounds.height - requested.height)
    )
  };
}

function dragThresholdReached(origin, point, threshold = 4) {
  if (!origin || !point) return false;
  return Math.hypot(point.x - origin.x, point.y - origin.y) >= threshold;
}

module.exports = {
  collapsedBoundsFromAnimationVisual,
  dragThresholdReached,
  findAnimationHitRegion,
  normalizeAnimationHitPayload,
  normalizeLocalRect,
  screenPointToLocal
};
