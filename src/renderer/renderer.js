const appEl = document.getElementById("app");
const visibilityFrameEl = document.getElementById("visibilityFrame");
const ballEl = document.getElementById("ball");
const ballArtEl = ballEl.querySelector(".ball-art");
const edgeSensorEl = document.getElementById("edgeSensor");
const animationDollEl = document.getElementById("animationDoll");
const animationBagEls = [...document.querySelectorAll(".animation-bag")];
const peekArtEls = [...document.querySelectorAll(".peek-art")];
const menuEl = document.querySelector(".menu");
const toastEl = document.getElementById("toast");
const DRAG_THRESHOLD = 4;
const BALL_SIZE = 64;
const SIDE_EXPANDED_BALL_TOP = 64;
const MENU_SIDE_TOP = 18;
const MENU_EDGE_GAP = 82;
const MENU_SAFE_MARGIN = 18;

let expandTimer = null;
let collapseTimer = null;
let toastTimer = null;
let dragging = false;
let moved = false;
let dragOrigin = null;
let currentMode = "collapsed";
let currentBallState = "floating";
let currentDisplayMode = "full";
let currentRuntimeMode = "normal";
let pointerInside = false;
let dragTarget = null;
let pendingDragContext = null;
let animationHitRegionTimer = null;
let clickTimer = null;

const BALL_STATE_CLASSES = [
  "ball-state-floating",
  "ball-state-docked-visible",
  "ball-state-hiding",
  "ball-state-docked-hidden",
  "ball-state-revealing"
];
const EDGE_CLASSES = ["edge-left", "edge-right", "edge-top", "edge-bottom"];
const BOTTOM_DIVE_CLASSES = ["bottom-dive-left", "bottom-dive-right"];
const VISIBILITY_CLASSES = [
  "visibility-prepare-show",
  "visibility-hiding",
  "visibility-showing"
];

let visibilityAnimationTimer = null;

function canHoverOpen() {
  return currentRuntimeMode !== "game" && currentDisplayMode !== "quiet-edge" &&
    ["floating", "docked-visible"].includes(currentBallState);
}

function reportMenuHeight() {
  const menuHeight = menuEl.offsetHeight;
  const verticalEdge = appEl.classList.contains("edge-top") ||
    appEl.classList.contains("edge-bottom");
  const height = verticalEdge
    ? menuHeight + MENU_EDGE_GAP + MENU_SAFE_MARGIN
    : Math.max(
      menuHeight + MENU_SIDE_TOP + MENU_SAFE_MARGIN,
      SIDE_EXPANDED_BALL_TOP + BALL_SIZE + MENU_SAFE_MARGIN
    );
  window.translatorShell.setMenuHeight(
    Math.ceil(height)
  );
}

reportMenuHeight();
window.addEventListener("resize", reportMenuHeight);

function screenPoint(event) {
  return { x: Math.round(event.screenX), y: Math.round(event.screenY) };
}

function isCharacterAnimationState(state = currentBallState) {
  return state === "hiding" || state === "revealing";
}

function effectiveOpacity(element) {
  let opacity = 1;
  for (let current = element; current && current !== document.documentElement; current = current.parentElement) {
    const style = window.getComputedStyle(current);
    if (style.display === "none" || style.visibility === "hidden") return 0;
    opacity *= Number.parseFloat(style.opacity || "1");
    if (opacity <= 0.04) return 0;
    if (current === appEl) break;
  }
  return opacity;
}

function localVisualBounds(element, name) {
  if (!element || effectiveOpacity(element) <= 0.04) return null;
  const rect = element.getBoundingClientRect();
  const left = Math.max(0, rect.left);
  const top = Math.max(0, rect.top);
  const right = Math.min(window.innerWidth, rect.right);
  const bottom = Math.min(window.innerHeight, rect.bottom);
  if (right - left < 2 || bottom - top < 2) return null;
  return { name, x: left, y: top, width: right - left, height: bottom - top };
}

function collectAnimationHitRegions() {
  const candidates = [
    ...animationBagEls.map((element, index) => ({ element, name: `bag-${index}` })),
    { element: animationDollEl, name: "doll" },
    ...peekArtEls.map((element) => ({ element, name: "peek" })),
    { element: ballEl, name: "static-ball" }
  ];
  return candidates
    .map(({ element, name }) => localVisualBounds(element, name))
    .filter(Boolean);
}

function reportAnimationHitRegions() {
  if (!isCharacterAnimationState() || dragging) return [];
  const regions = collectAnimationHitRegions();
  window.translatorShell.setAnimationHitRegions({
    viewport: { width: window.innerWidth, height: window.innerHeight },
    regions
  });
  return regions;
}

function stopAnimationHitRegionLoop() {
  window.clearTimeout(animationHitRegionTimer);
  animationHitRegionTimer = null;
}

function runAnimationHitRegionLoop() {
  stopAnimationHitRegionLoop();
  if (!isCharacterAnimationState() || dragging) return;
  window.requestAnimationFrame(() => {
    reportAnimationHitRegions();
    if (!isCharacterAnimationState() || dragging) return;
    animationHitRegionTimer = window.setTimeout(runAnimationHitRegionLoop, 32);
  });
}

function clearHoverTimers() {
  window.clearTimeout(expandTimer);
  window.clearTimeout(collapseTimer);
}

function preventNativeDrag(event) {
  event.preventDefault();
}

function scheduleExpand() {
  clearHoverTimers();
  expandTimer = window.setTimeout(() => {
    if (!dragging && canHoverOpen()) {
      window.translatorShell.expandMenu();
    }
  }, 340);
}

function scheduleCollapse() {
  clearHoverTimers();
  collapseTimer = window.setTimeout(() => {
    if (!dragging) window.translatorShell.collapseMenu();
  }, 430);
}

function showToast(text) {
  toastEl.textContent = text;
  toastEl.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastEl.classList.remove("visible");
  }, 1500);
}

window.translatorShell.onWindowState((state) => {
  const previousBallState = currentBallState;
  const hidingPath = previousBallState === "hiding"
    ? animationDollEl.parentElement.getAnimations().find(
      (animation) => animation.animationName === "dock-doll-edge-path"
    )
    : null;
  const hidingPathTime = Number(hidingPath?.currentTime) || 0;
  currentMode = state.mode;
  currentBallState = state.ballState || "floating";
  currentDisplayMode = state.displayMode || "full";
  currentRuntimeMode = state.runtimeMode || "normal";
  appEl.classList.toggle("runtime-game", currentRuntimeMode === "game");
  for (const image of peekArtEls) {
    const source = currentRuntimeMode === "game" ? image.dataset.gameSrc : image.dataset.normalSrc;
    if (source && image.getAttribute("src") !== source) image.setAttribute("src", source);
  }
  appEl.classList.toggle("expanded", state.mode === "expanded");
  appEl.classList.toggle("collapsed", state.mode !== "expanded");
  appEl.classList.remove(...EDGE_CLASSES);
  appEl.classList.add(`edge-${state.edge || "right"}`);
  appEl.classList.remove(...BOTTOM_DIVE_CLASSES);
  appEl.classList.add(`bottom-dive-${state.bottomDiveSide === "right" ? "right" : "left"}`);
  appEl.classList.toggle("display-quiet-edge", currentDisplayMode === "quiet-edge");
  appEl.classList.remove(...BALL_STATE_CLASSES);
  appEl.classList.add(`ball-state-${currentBallState}`);
  window.requestAnimationFrame(reportMenuHeight);
  if (state.ballConfig) {
    appEl.style.setProperty("--hide-duration", `${state.ballConfig.hideAnimationMs}ms`);
    appEl.style.setProperty("--hide-doll-duration", `${state.ballConfig.hideDollMs || state.ballConfig.hideAnimationMs}ms`);
    appEl.style.setProperty("--hide-bag-delay", `${state.ballConfig.hideBagDelayMs || 0}ms`);
    appEl.style.setProperty("--hide-offscreen-pause-duration", `${state.ballConfig.hideOffscreenPauseMs || 0}ms`);
    appEl.style.setProperty("--hide-peek-duration", `${state.ballConfig.hidePeekMs || 0}ms`);
    appEl.style.setProperty("--reveal-duration", `${state.ballConfig.revealAnimationMs}ms`);
    appEl.style.setProperty("--reveal-entry-duration", `${state.ballConfig.revealEntryMs}ms`);
    appEl.style.setProperty("--reveal-handoff-duration", `${state.ballConfig.revealHandoffMs || 0}ms`);
    appEl.style.setProperty(
      "--reveal-doll-entry-duration",
      `${state.ballConfig.revealDollEntryMs || state.ballConfig.revealEntryMs}ms`
    );
    appEl.style.setProperty("--reveal-settle-duration", `${state.ballConfig.revealSettleMs}ms`);
    appEl.style.setProperty("--reveal-settle-delay", `${state.ballConfig.revealEntryMs}ms`);
    appEl.style.setProperty(
      "--reveal-bag-delay",
      `${(state.ballConfig.revealHandoffMs || 0) + state.ballConfig.revealBagDelayMs}ms`
    );
    appEl.style.setProperty("--hidden-scale", state.ballConfig.hiddenScale);
  }
  if (Number.isFinite(state.animationSceneLeft)) {
    appEl.style.setProperty("--animation-scene-left", `${state.animationSceneLeft}px`);
    appEl.style.setProperty("--animation-scene-top", `${state.animationSceneTop}px`);
  } else {
    appEl.style.removeProperty("--animation-scene-left");
    appEl.style.removeProperty("--animation-scene-top");
  }
  if (previousBallState === "hiding" && currentBallState === "revealing") {
    const entryDuration = state.ballConfig?.revealDollEntryMs || state.ballConfig?.revealEntryMs || 500;
    const traversed = Math.min(entryDuration, hidingPathTime);
    appEl.style.setProperty("--reveal-handoff-duration", "0ms");
    appEl.style.setProperty("--reveal-doll-entry-duration", `${entryDuration}ms`);
    appEl.style.setProperty("--reveal-settle-delay", `${traversed}ms`);
    appEl.style.setProperty("--reveal-bag-delay", `${state.ballConfig?.revealBagDelayMs || 0}ms`);
    window.requestAnimationFrame(() => {
      const reversePath = animationDollEl.parentElement.getAnimations().find(
        (animation) => [
          "dock-doll-edge-path",
          "dock-doll-side-reveal-path",
          "dock-doll-top-reveal-path",
          "dock-doll-bottom-spring-reveal-path"
        ].includes(animation.animationName)
      );
      if (!reversePath) return;
      reversePath.currentTime = entryDuration - traversed;
      reversePath.play();
    });
  }
  if (isCharacterAnimationState()) runAnimationHitRegionLoop();
  else stopAnimationHitRegionLoop();
});

window.translatorShell.onAppNotice(showToast);

document.querySelectorAll("img").forEach((image) => {
  image.draggable = false;
});

appEl.addEventListener("dragstart", preventNativeDrag, true);

function clearVisibilityAnimationClasses() {
  appEl.classList.remove(...VISIBILITY_CLASSES);
}

function stabilizeVisibilityAnimation({ resetVars = false } = {}) {
  window.clearTimeout(visibilityAnimationTimer);
  visibilityAnimationTimer = null;
  clearVisibilityAnimationClasses();
  for (const animation of visibilityFrameEl.getAnimations()) {
    if (["floating-ui-hide", "floating-ui-show"].includes(animation.animationName)) {
      animation.cancel();
    }
  }
  if (resetVars) {
    appEl.style.setProperty("--visibility-offset-x", "0px");
    appEl.style.setProperty("--visibility-offset-y", "0px");
  }
}

function applyVisibilityAnimationVars(payload) {
  const offset = payload?.offset || { x: 0, y: 0 };
  appEl.style.setProperty("--visibility-offset-x", `${offset.x || 0}px`);
  appEl.style.setProperty("--visibility-offset-y", `${offset.y || 0}px`);
  appEl.style.setProperty(
    "--visibility-duration",
    `${Math.max(1, Number(payload?.durationMs) || 300)}ms`
  );
}

function finishVisibilityAnimation(payload) {
  window.clearTimeout(visibilityAnimationTimer);
  visibilityAnimationTimer = null;
  if (payload.type === "show") stabilizeVisibilityAnimation({ resetVars: true });
  window.translatorShell.floatingUiAnimationFinished({
    token: payload.token,
    type: payload.type
  });
}

window.translatorShell.onFloatingUiVisibilityAnimation((payload) => {
  if (!payload?.type) return;
  window.clearTimeout(visibilityAnimationTimer);

  if (payload.type === "stable") {
    stabilizeVisibilityAnimation({ resetVars: true });
    return;
  }

  applyVisibilityAnimationVars(payload);

  if (payload.type === "prepare-show") {
    stabilizeVisibilityAnimation();
    appEl.classList.add("visibility-prepare-show");
    return;
  }

  stabilizeVisibilityAnimation();
  void appEl.offsetWidth;
  const className = payload.type === "hide"
    ? "visibility-hiding"
    : "visibility-showing";
  appEl.classList.add(className);

  const handleAnimationEnd = (event) => {
    if (event.target !== visibilityFrameEl) return;
    visibilityFrameEl.removeEventListener("animationend", handleAnimationEnd);
    finishVisibilityAnimation(payload);
  };
  visibilityFrameEl.addEventListener("animationend", handleAnimationEnd);
  visibilityAnimationTimer = window.setTimeout(() => {
    visibilityFrameEl.removeEventListener("animationend", handleAnimationEnd);
    finishVisibilityAnimation(payload);
  }, (Number(payload.durationMs) || 300) + 80);
});

appEl.addEventListener("mouseenter", (event) => {
  pointerInside = true;
  window.translatorShell.setPointerPresence(true, screenPoint(event));
  clearHoverTimers();
});
appEl.addEventListener("mouseleave", (event) => {
  pointerInside = false;
  window.translatorShell.setPointerPresence(false, screenPoint(event));
  scheduleCollapse();
});

function prepareDrag(event, context = null, target = event.currentTarget) {
  if (event.button !== 0) return;
  event.preventDefault();
  clearHoverTimers();
  dragging = true;
  moved = false;
  dragOrigin = screenPoint(event);
  dragTarget = target;
  pendingDragContext = context;
  try {
    dragTarget.setPointerCapture(event.pointerId);
  } catch {}
}

function beginDrag(event) {
  prepareDrag(event);
}

ballEl.addEventListener("pointerdown", beginDrag);
edgeSensorEl.addEventListener("pointerdown", beginDrag);

appEl.addEventListener("pointerdown", (event) => {
  if (!isCharacterAnimationState() || dragging || event.button !== 0) return;
  const regions = collectAnimationHitRegions();
  const visualBounds = [...regions].reverse().find((region) => (
    event.clientX >= region.x &&
    event.clientX < region.x + region.width &&
    event.clientY >= region.y &&
    event.clientY < region.y + region.height
  ));
  if (!visualBounds) return;
  prepareDrag(event, {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    visualBounds
  }, appEl);
}, true);

function moveDrag(event) {
  if (!dragging) return;
  const point = screenPoint(event);
  if (
    !moved &&
    Math.hypot(point.x - dragOrigin.x, point.y - dragOrigin.y) < DRAG_THRESHOLD
  ) {
    return;
  }
  if (!moved) {
    moved = true;
    stabilizeVisibilityAnimation({ resetVars: true });
    stopAnimationHitRegionLoop();
    appEl.classList.add("dragging");
    window.translatorShell.startDrag(point, pendingDragContext);
  }
  window.translatorShell.moveDrag(point);
}

ballEl.addEventListener("pointermove", moveDrag);
edgeSensorEl.addEventListener("pointermove", moveDrag);
appEl.addEventListener("pointermove", (event) => {
  if (dragging && dragTarget === appEl) moveDrag(event);
  else if (isCharacterAnimationState()) reportAnimationHitRegions();
});

function finishDrag(event) {
  if (!dragging) return;
  dragging = false;
  appEl.classList.remove("dragging");
  if (dragTarget?.hasPointerCapture(event.pointerId)) {
    dragTarget.releasePointerCapture(event.pointerId);
  }
  if (moved) {
    window.translatorShell.endDrag({
      moved: true,
      point: screenPoint(event)
    });
  } else if (isCharacterAnimationState()) {
    runAnimationHitRegionLoop();
  }
  dragOrigin = null;
  dragTarget = null;
  pendingDragContext = null;
}

ballEl.addEventListener("pointerup", finishDrag);
ballEl.addEventListener("pointercancel", finishDrag);
edgeSensorEl.addEventListener("pointerup", finishDrag);
edgeSensorEl.addEventListener("pointercancel", finishDrag);
appEl.addEventListener("pointerup", (event) => {
  if (dragTarget === appEl) finishDrag(event);
});
appEl.addEventListener("pointercancel", (event) => {
  if (dragTarget === appEl) finishDrag(event);
});

function scheduleMenuToggle() {
  window.clearTimeout(clickTimer);
  clickTimer = window.setTimeout(() => {
    clickTimer = null;
    window.translatorShell.toggleFanMenu();
  }, 240);
}

function cancelMenuToggle() {
  window.clearTimeout(clickTimer);
  clickTimer = null;
}

ballEl.addEventListener("click", () => {
  if (moved || !["floating", "docked-visible"].includes(currentBallState)) return;
  ballArtEl.classList.remove("bouncing");
  void ballArtEl.offsetWidth;
  ballArtEl.classList.add("bouncing");
  scheduleMenuToggle();
});

ballEl.addEventListener("dblclick", (event) => {
  event.preventDefault();
  cancelMenuToggle();
  if (currentRuntimeMode === "game") window.translatorShell.triggerFeature("settings");
});

function requestNearestEdge(event) {
  event.preventDefault();
  cancelMenuToggle();
  if (currentRuntimeMode === "normal") window.translatorShell.snapToNearestEdge();
}

ballEl.addEventListener("contextmenu", requestNearestEdge);
edgeSensorEl.addEventListener("contextmenu", requestNearestEdge);

edgeSensorEl.addEventListener("click", () => {
  if (!moved && currentDisplayMode !== "quiet-edge") {
    window.translatorShell.setPointerPresence(true);
  }
  if (!moved) scheduleMenuToggle();
});

edgeSensorEl.addEventListener("dblclick", (event) => {
  cancelMenuToggle();
  if (currentRuntimeMode !== "game") return;
  event.preventDefault();
  window.translatorShell.triggerFeature("settings");
});

ballArtEl.addEventListener("animationend", () => {
  ballArtEl.classList.remove("bouncing");
});

animationDollEl.addEventListener("animationend", (event) => {
  const terminalAnimation = currentBallState === "hiding"
    ? "dock-doll-hide-visibility"
    : currentBallState === "revealing"
      ? "dock-doll-settle"
      : null;
  if (event.animationName !== terminalAnimation) return;
  window.translatorShell.animationFinished(currentBallState);
});

document.querySelectorAll(".menu-item").forEach((button) => {
  button.addEventListener("click", () => {
    window.translatorShell.triggerFeature(button.dataset.action);
  });
});
