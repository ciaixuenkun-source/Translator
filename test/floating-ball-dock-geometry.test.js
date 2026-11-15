const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DOCK_EDGES,
  BOTTOM_DIVE_SIDES,
  bottomDiveSideForBounds,
  boundsFromDrag,
  chooseDockEdge,
  cornerSafetyDistance,
  isDocked,
  snapBoundsToEdge,
  snapToNearbyEdge,
  snapToNearestEdge
} = require("../src/services/floating-ball/dock-geometry");

const display = {
  bounds: { x: 100, y: 50, width: 1000, height: 700 },
  workArea: { x: 100, y: 50, width: 1000, height: 660 }
};

test("chooses the nearest single edge when a ball is near a corner", () => {
  assert.equal(chooseDockEdge(
    { x: 108, y: 55, width: 76, height: 76 },
    display,
    { threshold: 60 }
  ), DOCK_EDGES.TOP);

  assert.equal(chooseDockEdge(
    { x: 102, y: 72, width: 76, height: 76 },
    display,
    { threshold: 60 }
  ), DOCK_EDGES.LEFT);
});

test("snaps top and bottom to physical display bounds instead of work area", () => {
  const bottom = snapBoundsToEdge(
    { x: 400, y: 600, width: 76, height: 76 },
    display,
    DOCK_EDGES.BOTTOM,
    { snapThreshold: 60 }
  );
  assert.equal(bottom.y, display.bounds.y + display.bounds.height - 76);
  assert.notEqual(bottom.y, display.workArea.y + display.workArea.height - 76);

  const top = snapBoundsToEdge(
    { x: 400, y: 60, width: 76, height: 76 },
    display,
    DOCK_EDGES.TOP,
    { snapThreshold: 60 }
  );
  assert.equal(top.y, display.bounds.y);
});

test("corner safety keeps docked positions out of dead corners", () => {
  const safety = cornerSafetyDistance({ width: 76, height: 76 }, 60);
  const left = snapBoundsToEdge(
    { x: 100, y: 50, width: 76, height: 76 },
    display,
    DOCK_EDGES.LEFT,
    { snapThreshold: 60 }
  );
  const top = snapBoundsToEdge(
    { x: 100, y: 50, width: 76, height: 76 },
    display,
    DOCK_EDGES.TOP,
    { snapThreshold: 60 }
  );

  assert.equal(left.y, display.bounds.y + safety);
  assert.equal(top.x, display.bounds.x + safety);
});

test("nearby snap docks only within threshold and otherwise keeps floating", () => {
  const near = snapToNearbyEdge(
    { x: 1030, y: 260, width: 76, height: 76 },
    display,
    { threshold: 60 }
  );
  assert.equal(near.docked, true);
  assert.equal(near.edge, DOCK_EDGES.RIGHT);

  const far = snapToNearbyEdge(
    { x: 450, y: 260, width: 76, height: 76 },
    display,
    { threshold: 60 }
  );
  assert.equal(far.docked, false);
});

test("production snap threshold stays near the original sixty pixel distance", () => {
  const newThreshold = 60;
  const nearRight = {
    x: display.bounds.x + display.bounds.width - 76 - 58,
    y: 260,
    width: 76,
    height: 76
  };

  assert.equal(snapToNearbyEdge(
    nearRight,
    display,
    { threshold: 57 }
  ).docked, false);

  const snap = snapToNearbyEdge(
    nearRight,
    display,
    { threshold: newThreshold }
  );
  assert.equal(snap.docked, true);
  assert.equal(snap.edge, DOCK_EDGES.RIGHT);

  assert.equal(snapToNearbyEdge(
    { x: 450, y: 260, width: 76, height: 76 },
    display,
    { threshold: newThreshold }
  ).docked, false);
});

test("drag end can synchronize the final pointer position before docking", () => {
  const finalBounds = boundsFromDrag(
    { x: 400, y: 260, width: 76, height: 76 },
    { x: 438, y: 298 },
    { x: 1008, y: 298 }
  );
  assert.equal(finalBounds.x, 970);

  const snap = snapToNearbyEdge(finalBounds, display, {
    threshold: 60
  });
  assert.equal(snap.docked, true);
  assert.equal(snap.edge, DOCK_EDGES.RIGHT);
});

test("nearest snap can place quiet mode onto the closest edge from the center", () => {
  const snap = snapToNearestEdge(
    { x: 610, y: 590, width: 76, height: 76 },
    display,
    { snapThreshold: 60 }
  );

  assert.equal(snap.edge, DOCK_EDGES.BOTTOM);
  assert.equal(isDocked(snap.bounds, display, { tolerance: 8 }), true);
});

test("bottom dive direction uses the current display center", () => {
  assert.equal(bottomDiveSideForBounds(
    { x: 220, y: 650, width: 76, height: 76 },
    display
  ), BOTTOM_DIVE_SIDES.LEFT);

  assert.equal(bottomDiveSideForBounds(
    { x: 880, y: 650, width: 76, height: 76 },
    display
  ), BOTTOM_DIVE_SIDES.RIGHT);

  const secondaryDisplay = {
    bounds: { x: -1200, y: 0, width: 1200, height: 800 }
  };
  assert.equal(bottomDiveSideForBounds(
    { x: -1080, y: 724, width: 76, height: 76 },
    secondaryDisplay
  ), BOTTOM_DIVE_SIDES.LEFT);
  assert.equal(bottomDiveSideForBounds(
    { x: -180, y: 724, width: 76, height: 76 },
    secondaryDisplay
  ), BOTTOM_DIVE_SIDES.RIGHT);
});
