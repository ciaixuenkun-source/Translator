const { app, BrowserWindow, ipcMain, screen } = require("electron");
const path = require("path");
const fs = require("fs");
const { createStartupTiming } = require("./startup-timing");
const { createTranslatorRuntime } = require("./services/translator");
const {
  TranslationWindowController
} = require("./windows/translation-window-controller");
const {
  LocalTranslationWindowController
} = require("./windows/local-translate/local-translation-window-controller");
const { LanguagePreferencesStore } = require("./windows/local-translate/language-preferences-store");
const { HotkeyManager } = require("./services/hotkeys/hotkey-manager");
const {
  RUNTIME_MODES,
  RuntimeModeStore,
  normalizeRuntimeMode
} = require("./services/runtime-mode/runtime-mode-store");
const { GameSessionController } = require("./services/game-mode/game-session-controller");
const { gameRuntimeState } = require("./services/game-mode/game-runtime-state");
const { FanMenuController } = require("./windows/fan-menu/controller");
const {
  SettingsWindowController
} = require("./windows/settings/settings-window-controller");
const {
  RegionCaptureController
} = require("./services/region-capture/region-capture-controller");
const {
  TranslationOverlayStyleStore
} = require("./services/region-capture/translation-overlay-style-store");
const { secondInstanceAction } = require("./services/floating-ball/second-instance-policy");
const { createOcrRuntime } = require("./services/ocr");
const {
  APP_ID,
  APP_ICON_PATH,
  APP_NAME,
  applyWindowAppDetails
} = require("./app-assets");
const {
  BALL_DISPLAY_MODES,
  BALL_STATES,
  DockedBallStateMachine
} = require("./services/floating-ball/docked-ball-state-machine");
const {
  DOCKED_BALL_VISUAL_CONFIG
} = require("./services/floating-ball/docked-ball-visual-config");
const {
  applyFloatingBallWindowLevel
} = require("./services/floating-ball/window-level");
const {
  createPointerPresenceMonitor,
  pointIsInsideBounds,
  shouldCollapseExpandedMenu,
  stablePointerBounds: resolveStablePointerBounds
} = require("./services/floating-ball/pointer-interaction");
const {
  createFloatingUiSnapshot,
  createVisibilityAnimationPayload,
  snapshotNeedsHiddenBoundsRestore
} = require("./services/floating-ball/visibility-state");
const {
  collapsedBoundsFromAnimationVisual,
  findAnimationHitRegion,
  normalizeAnimationHitPayload
} = require("./services/floating-ball/animation-drag");
const { edgeTrackBounds } = require("./services/floating-ball/edge-track-drag");
const { animateWindowBounds } = require("./services/floating-ball/window-motion");
const {
  DISPLAY_MODES,
  DOCK_EDGES,
  bottomDiveSideForBounds,
  boundsFromDrag,
  clamp,
  isDocked,
  normalizeDisplayMode,
  normalizeDockEdge,
  snapBoundsToEdge,
  snapToNearbyEdge: calculateNearbyDock,
  snapToNearestEdge
} = require("./services/floating-ball/dock-geometry");

const startupTiming = createStartupTiming();
startupTiming.mark("T0 main process start");

const COLLAPSED = { width: 76, height: 76 };
const EXPANDED_WIDTH = 318;
const DEFAULT_EXPANDED_HEIGHT = 240;
const CHARACTER_ANIMATION_STAGE = { width: 220, height: 190 };
const EDGE_SNAP_THRESHOLD = 60;
const COLLAPSED_BALL_TOP = 6;
const EXPANDED_BALL_TOP = 64;
const DOCKED_BALL_CONFIG = DOCKED_BALL_VISUAL_CONFIG;
const DOCKED_HIDDEN = {
  width: DOCKED_BALL_CONFIG.hiddenWindowWidth,
  height: DOCKED_BALL_CONFIG.hiddenWindowHeight
};
const EDGE_DOCK_TOLERANCE = 8;

let mainWindow;
let viewState = "collapsed";
let edge = DOCK_EDGES.RIGHT;
let ballDisplayMode = DISPLAY_MODES.FULL;
let dragState = null;
let expandedHeight = DEFAULT_EXPANDED_HEIGHT;
let translationWindows = null;
let localTranslationWindows = null;
let settingsWindow = null;
let hotkeyManager = null;
let regionCapture = null;
let ocrService = null;
let translatorRuntime = null;
let languagePreferences = null;
let cleanupPromise = null;
let isQuitting = false;
let dockedBall = null;
let floatingUiHidden = false;
let floatingUiAnimationActive = false;
let hiddenFloatingUiSnapshot = null;
let visibilityAnimationToken = 0;
let animationSceneLeft = null;
let animationSceneTop = null;
let pointerPresenceMonitor = null;
let floatingBallCaptureActive = false;
let capturePointerMonitorWasRunning = false;
let animationHitPayload = { viewport: null, regions: [] };
let animationWindowAcceptingInput = false;
let animationDragTakeoverBounds = null;
let runtimeMode = RUNTIME_MODES.NORMAL;
let runtimeModeStore = null;
let normalModeSnapshot = null;
let gameSession = null;
let overlayStyleStore = null;
let fanMenu = null;
let cancelSnapAnimation = null;

const statePath = () => path.join(app.getPath("userData"), "window-state.json");

function readSavedState() {
  try {
    return JSON.parse(fs.readFileSync(statePath(), "utf8"));
  } catch {
    return {};
  }
}

function saveState(bounds) {
  const payload = { edge, displayMode: ballDisplayMode, x: bounds.x, y: bounds.y };
  fs.mkdirSync(path.dirname(statePath()), { recursive: true });
  fs.writeFileSync(statePath(), JSON.stringify(payload, null, 2));
}

function getDisplayFor(bounds) {
  const display = screen.getDisplayMatching(bounds);
  return display;
}

function collapsedBoundsFromSaved() {
  const saved = readSavedState();
  const savedBounds = {
    x: Number.isFinite(saved.x) ? saved.x : 0,
    y: Number.isFinite(saved.y) ? saved.y : 0,
    ...COLLAPSED
  };
  const display = Number.isFinite(saved.x) && Number.isFinite(saved.y)
    ? getDisplayFor(savedBounds)
    : screen.getPrimaryDisplay();
  const bounds = display.bounds;
  edge = normalizeDockEdge(saved.edge);
  ballDisplayMode = DISPLAY_MODES.FULL;
  const fallbackX =
    edge === DOCK_EDGES.LEFT
      ? bounds.x
      : edge === DOCK_EDGES.RIGHT
        ? bounds.x + bounds.width - COLLAPSED.width
        : bounds.x + Math.round((bounds.width - COLLAPSED.width) / 2);
  const x = clamp(
    Number.isFinite(saved.x) ? saved.x : fallbackX,
    bounds.x,
    bounds.x + bounds.width - COLLAPSED.width
  );
  const fallbackY =
    edge === DOCK_EDGES.TOP
      ? bounds.y
      : edge === DOCK_EDGES.BOTTOM
        ? bounds.y + bounds.height - COLLAPSED.height
        : bounds.y + Math.round(bounds.height * 0.36);
  const y = clamp(
    Number.isFinite(saved.y) ? saved.y : fallbackY,
    bounds.y,
    bounds.y + bounds.height - COLLAPSED.height
  );
  if (ballDisplayMode === DISPLAY_MODES.FULL) {
    return { x, y, ...COLLAPSED };
  }
  return snapBoundsToEdge({ x, y, ...COLLAPSED }, display, edge, {
    size: COLLAPSED,
    snapThreshold: EDGE_SNAP_THRESHOLD
  });
}

function expandedBoundsFromCollapsed(bounds) {
  const display = getDisplayFor(bounds);
  const area = display.bounds;
  let naturalX = bounds.x + Math.round((COLLAPSED.width - EXPANDED_WIDTH) / 2);
  let targetY = bounds.y + COLLAPSED_BALL_TOP - EXPANDED_BALL_TOP;

  if (edge === DOCK_EDGES.LEFT) {
    naturalX = bounds.x;
  } else if (edge === DOCK_EDGES.RIGHT) {
    naturalX = bounds.x + COLLAPSED.width - EXPANDED_WIDTH;
  } else if (edge === DOCK_EDGES.TOP) {
    targetY = bounds.y;
  } else if (edge === DOCK_EDGES.BOTTOM) {
    targetY = bounds.y + COLLAPSED.height - expandedHeight;
  }

  const x = clamp(naturalX, area.x, area.x + area.width - EXPANDED_WIDTH);
  const y = clamp(targetY, area.y, area.y + area.height - expandedHeight);
  return { x, y, width: EXPANDED_WIDTH, height: expandedHeight };
}

function collapsedBoundsFromExpanded(bounds) {
  const display = getDisplayFor(bounds);
  let x = bounds.x + Math.round((EXPANDED_WIDTH - COLLAPSED.width) / 2);
  let y = bounds.y + EXPANDED_BALL_TOP - COLLAPSED_BALL_TOP;

  if (edge === DOCK_EDGES.LEFT) {
    x = bounds.x;
  } else if (edge === DOCK_EDGES.RIGHT) {
    x = bounds.x + EXPANDED_WIDTH - COLLAPSED.width;
  } else if (edge === DOCK_EDGES.TOP) {
    y = bounds.y;
  } else if (edge === DOCK_EDGES.BOTTOM) {
    y = bounds.y + expandedHeight - COLLAPSED.height;
  }

  return snapBoundsToEdge({ x, y, ...COLLAPSED }, display, edge, {
    size: COLLAPSED,
    snapThreshold: EDGE_SNAP_THRESHOLD
  });
}

function isBoundsDocked(bounds) {
  return isDocked(bounds, getDisplayFor(bounds), {
    tolerance: EDGE_DOCK_TOLERANCE,
    currentEdge: edge
  });
}

function characterAnimationBoundsFromCollapsed(bounds) {
  const display = getDisplayFor(bounds);
  const area = display.bounds;
  const sceneGlobalX = bounds.x + 6;
  const sceneGlobalY = bounds.y + (edge === DOCK_EDGES.TOP ? 12 : 6);
  let targetX = clamp(
    Math.round(sceneGlobalX - (CHARACTER_ANIMATION_STAGE.width - 64) / 2),
    area.x,
    area.x + area.width - CHARACTER_ANIMATION_STAGE.width
  );
  let targetY = clamp(
    Math.round(sceneGlobalY - (CHARACTER_ANIMATION_STAGE.height - 64) / 2),
    area.y,
    area.y + area.height - CHARACTER_ANIMATION_STAGE.height
  );

  if (edge === DOCK_EDGES.LEFT) targetX = area.x;
  if (edge === DOCK_EDGES.RIGHT) {
    targetX = area.x + area.width - CHARACTER_ANIMATION_STAGE.width;
  }
  if (edge === DOCK_EDGES.TOP) targetY = area.y;
  if (edge === DOCK_EDGES.BOTTOM) {
    targetY = area.y + area.height - CHARACTER_ANIMATION_STAGE.height;
  }

  return {
    bounds: {
      x: targetX,
      y: targetY,
      ...CHARACTER_ANIMATION_STAGE
    },
    sceneLeft: Math.round(sceneGlobalX - targetX),
    sceneTop: Math.round(sceneGlobalY - targetY)
  };
}

function collapsedBoundsFromCharacterAnimation(bounds) {
  const display = getDisplayFor(bounds);
  const sceneLeft = Number.isFinite(animationSceneLeft)
    ? animationSceneLeft
    : Math.round((bounds.width - DOCKED_BALL_CONFIG.ballDisplaySize) / 2);
  const sceneTop = Number.isFinite(animationSceneTop)
    ? animationSceneTop
    : Math.round((bounds.height - DOCKED_BALL_CONFIG.ballDisplaySize) / 2);
  return snapBoundsToEdge({
    x: Math.round(bounds.x + sceneLeft - 6),
    y: Math.round(bounds.y + sceneTop - (edge === DOCK_EDGES.TOP ? 12 : 6)),
    ...COLLAPSED
  }, display, edge, {
    size: COLLAPSED,
    snapThreshold: EDGE_SNAP_THRESHOLD
  });
}

function setCharacterAnimationStageFromCollapsed(bounds) {
  const stage = characterAnimationBoundsFromCollapsed(bounds);
  animationSceneLeft = stage.sceneLeft;
  animationSceneTop = stage.sceneTop;
  mainWindow.setBounds(stage.bounds, false);
}

function isCharacterAnimationState(state) {
  return [BALL_STATES.HIDING, BALL_STATES.REVEALING].includes(state);
}

function collapsedBallTopForEdge(dockEdge = edge) {
  if (dockEdge === DOCK_EDGES.TOP) return 10;
  if (dockEdge === DOCK_EDGES.BOTTOM) return COLLAPSED.height - DOCKED_BALL_CONFIG.ballDisplaySize;
  return COLLAPSED_BALL_TOP;
}

function setAnimationWindowAcceptingInput(acceptingInput) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const next = Boolean(acceptingInput);
  if (animationWindowAcceptingInput === next) return;
  animationWindowAcceptingInput = next;
  if (next) mainWindow.setIgnoreMouseEvents(false);
  else mainWindow.setIgnoreMouseEvents(true, { forward: true });
}

function clearAnimationHitRegions() {
  animationHitPayload = { viewport: null, regions: [] };
  animationWindowAcceptingInput = false;
}

function updateAnimationWindowInput(point = null) {
  if (
    !mainWindow ||
    mainWindow.isDestroyed() ||
    !isCharacterAnimationState(dockedBall?.state) ||
    floatingBallCaptureActive ||
    floatingUiHidden ||
    dockedBall?.suspended ||
    dragState
  ) {
    return false;
  }
  const cursor = point || screen.getCursorScreenPoint();
  const region = findAnimationHitRegion({
    point: cursor,
    windowBounds: mainWindow.getBounds(),
    ...animationHitPayload
  });
  setAnimationWindowAcceptingInput(Boolean(region));
  return Boolean(region);
}

function stablePointerBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  const bounds = mainWindow.getBounds();
  return resolveStablePointerBounds({
    windowBounds: bounds,
    ballState: dockedBall?.state,
    collapsedAnimationBounds: isCharacterAnimationState(dockedBall?.state)
      ? collapsedBoundsFromCharacterAnimation(bounds)
      : null
  });
}

function syncDockedBallPointerPresence() {
  if (!mainWindow || mainWindow.isDestroyed() || !dockedBall) return false;
  if (
    floatingBallCaptureActive ||
    floatingUiHidden ||
    dockedBall.suspended ||
    !mainWindow.isVisible()
  ) {
    return false;
  }
  const point = screen.getCursorScreenPoint();
  updateAnimationWindowInput(point);
  const inside = pointIsInsideBounds(point, stablePointerBounds());
  if (inside) {
    dockedBall.pointerEntered(point);
  } else if (shouldCollapseExpandedMenu({ inside, viewState, dragging: Boolean(dragState) })) {
    viewState = "collapsed";
    mainWindow.setBounds(collapsedBoundsFromExpanded(mainWindow.getBounds()), false);
    dockedBall.pointerLeft(point);
    dockedBall.menuClosed();
    sendWindowState();
  } else {
    dockedBall.pointerLeft(point);
  }
  return inside;
}

function maintainFloatingBallWindowLevel() {
  if (
    !mainWindow ||
    mainWindow.isDestroyed() ||
    floatingBallCaptureActive ||
    floatingUiHidden ||
    dockedBall?.suspended ||
    !mainWindow.isVisible()
  ) {
    return false;
  }
  applyFloatingBallWindowLevel(mainWindow);
  return true;
}

function hiddenBoundsFromCollapsed(bounds) {
  const display = getDisplayFor(bounds);
  if (edge === DOCK_EDGES.TOP || edge === DOCK_EDGES.BOTTOM) {
    const centerX = bounds.x + COLLAPSED.width / 2;
    return snapBoundsToEdge({
      x: Math.round(centerX - DOCKED_HIDDEN.width / 2),
      y: bounds.y,
      ...DOCKED_HIDDEN
    }, display, edge, {
      size: DOCKED_HIDDEN,
      snapThreshold: EDGE_SNAP_THRESHOLD
    });
  }
  const centerY = bounds.y + COLLAPSED.height / 2;
  return snapBoundsToEdge({
    x: bounds.x,
    y: Math.round(centerY - DOCKED_HIDDEN.height / 2),
    ...DOCKED_HIDDEN
  }, display, edge, {
    size: DOCKED_HIDDEN,
    snapThreshold: EDGE_SNAP_THRESHOLD
  });
}

function collapsedBoundsFromHidden(bounds) {
  const display = getDisplayFor(bounds);
  if (edge === DOCK_EDGES.TOP || edge === DOCK_EDGES.BOTTOM) {
    const centerX = bounds.x + DOCKED_HIDDEN.width / 2;
    return snapBoundsToEdge({
      x: Math.round(centerX - COLLAPSED.width / 2),
      y: bounds.y,
      ...COLLAPSED
    }, display, edge, {
      size: COLLAPSED,
      snapThreshold: EDGE_SNAP_THRESHOLD
    });
  }
  const centerY = bounds.y + DOCKED_HIDDEN.height / 2;
  return snapBoundsToEdge({
    x: bounds.x,
    y: Math.round(centerY - COLLAPSED.height / 2),
    ...COLLAPSED
  }, display, edge, {
    size: COLLAPSED,
    snapThreshold: EDGE_SNAP_THRESHOLD
  });
}

function handleDockedBallStateChange(nextState, previousState) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  let currentBounds = mainWindow.getBounds();
  const wasAnimating = isCharacterAnimationState(previousState);
  const willAnimate = isCharacterAnimationState(nextState);
  if (wasAnimating && !willAnimate) {
    currentBounds = animationDragTakeoverBounds || collapsedBoundsFromCharacterAnimation(currentBounds);
    animationDragTakeoverBounds = null;
    clearAnimationHitRegions();
    mainWindow.setIgnoreMouseEvents(false);
    if (nextState !== BALL_STATES.DOCKED_HIDDEN) {
      // Remove the animation layers before the native window is collapsed. Otherwise
      // Chromium can composite one revealing frame inside the new 76x76 bounds.
      sendWindowState();
      mainWindow.setBounds(currentBounds, false);
    }
    animationSceneLeft = null;
    animationSceneTop = null;
  }
  if (previousState === BALL_STATES.DOCKED_HIDDEN && nextState !== previousState) {
    mainWindow.setBounds(collapsedBoundsFromHidden(mainWindow.getBounds()), false);
    currentBounds = mainWindow.getBounds();
  }
  if (willAnimate && !wasAnimating) {
    clearAnimationHitRegions();
    setCharacterAnimationStageFromCollapsed(currentBounds);
    animationWindowAcceptingInput = false;
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
  }
  if (nextState === BALL_STATES.DOCKED_HIDDEN) {
    mainWindow.setBounds(hiddenBoundsFromCollapsed(currentBounds), false);
  }
  maintainFloatingBallWindowLevel();
  sendWindowState();
  if (
    nextState === BALL_STATES.DOCKED_HIDDEN ||
    (wasAnimating && nextState === BALL_STATES.DOCKED_VISIBLE)
  ) {
    setImmediate(syncDockedBallPointerPresence);
  }
}

function sendWindowState() {
  if (!mainWindow) return;
  const currentBounds = mainWindow.getBounds();
  mainWindow.webContents.send("window-state", {
    mode: viewState,
    edge,
    displayMode: runtimeMode === RUNTIME_MODES.GAME ? DISPLAY_MODES.QUIET_EDGE : ballDisplayMode,
    runtimeMode,
    ballState: dockedBall?.state || BALL_STATES.FLOATING,
    ballConfig: DOCKED_BALL_CONFIG,
    bottomDiveSide: bottomDiveSideForBounds(currentBounds, getDisplayFor(currentBounds)),
    animationSceneLeft,
    animationSceneTop
  });
}

function snapshotCurrentFloatingUi() {
  const bounds = mainWindow?.getBounds() || collapsedBoundsFromSaved();
  return createFloatingUiSnapshot({
    bounds,
    edge,
    displayMode: ballDisplayMode,
    viewState,
    ballState: dockedBall?.state || BALL_STATES.FLOATING,
    docked: mainWindow ? isBoundsDocked(bounds) : false
  });
}

function waitForFloatingUiAnimation(type, snapshot) {
  if (!mainWindow || mainWindow.isDestroyed()) return Promise.resolve();
  const token = ++visibilityAnimationToken;
  const payload = createVisibilityAnimationPayload(type, snapshot, token);
  return new Promise((resolve) => {
    let settled = false;
    let timeout = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      ipcMain.off("floating-ui-animation-finished", handleFinished);
      resolve();
    };
    const handleFinished = (event, result) => {
      if (!mainWindow || event.sender.id !== mainWindow.webContents.id) return;
      if (result?.token !== token || result?.type !== type) return;
      finish();
    };
    ipcMain.on("floating-ui-animation-finished", handleFinished);
    timeout = setTimeout(finish, payload.durationMs + 180);
    mainWindow.webContents.send("floating-ui-visibility-animation", payload);
  });
}

function prepareFloatingUiShowAnimation(snapshot) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(
    "floating-ui-visibility-animation",
    createVisibilityAnimationPayload("prepare-show", snapshot, null)
  );
}

function restoreFloatingUiSnapshot(snapshot) {
  if (!mainWindow || mainWindow.isDestroyed() || !snapshot) return;
  edge = normalizeDockEdge(snapshot.edge);
  ballDisplayMode = normalizeDisplayMode(snapshot.displayMode);
  viewState = "collapsed";

  const restoreBounds = snapshotNeedsHiddenBoundsRestore(snapshot)
    ? collapsedBoundsFromHidden(snapshot.bounds)
    : snapshot.bounds;
  mainWindow.setBounds(restoreBounds, false);
  syncDockedBallPointerPresence();

  dockedBall?.setDisplayMode(
    ballDisplayMode === DISPLAY_MODES.QUIET_EDGE
      ? BALL_DISPLAY_MODES.QUIET_EDGE
      : BALL_DISPLAY_MODES.FULL
  );
  dockedBall?.setDocked(snapshot.docked);
  saveState(mainWindow.getBounds());
  sendWindowState();
}

async function hideFloatingUi({ animate = true } = {}) {
  if (floatingUiHidden || floatingUiAnimationActive) return;
  if (!mainWindow || mainWindow.isDestroyed()) {
    floatingUiHidden = true;
    return;
  }

  if (regionCapture?.isCapturing() && !mainWindow.isVisible()) {
    hiddenFloatingUiSnapshot = snapshotCurrentFloatingUi();
    floatingUiHidden = true;
    return;
  }

  fanMenu?.close();
  floatingUiAnimationActive = true;
  if (viewState === "expanded") setExpanded(false);
  hiddenFloatingUiSnapshot = snapshotCurrentFloatingUi();
  floatingUiHidden = true;
  dockedBall?.suspend();

  if (mainWindow.isVisible() && animate) {
    await waitForFloatingUiAnimation("hide", hiddenFloatingUiSnapshot);
  }
  if (!mainWindow.isDestroyed() && mainWindow.isVisible()) mainWindow.hide();
  if (!mainWindow.isDestroyed()) {
    mainWindow.webContents.send("floating-ui-visibility-animation", {
      type: "stable"
    });
  }
  floatingUiAnimationActive = false;
}

async function showFloatingUi({ animate = true } = {}) {
  if (!floatingUiHidden || floatingUiAnimationActive) return;
  floatingUiHidden = false;
  if (regionCapture?.isCapturing()) return;

  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }

  floatingUiAnimationActive = true;
  const snapshot = hiddenFloatingUiSnapshot || snapshotCurrentFloatingUi();
  restoreFloatingUiSnapshot(snapshot);
  if (animate) {
    prepareFloatingUiShowAnimation(snapshot);
    await new Promise((resolve) => setImmediate(resolve));
  }
  if (!mainWindow.isVisible()) mainWindow.showInactive();
  applyFloatingBallWindowLevel(mainWindow);
  syncDockedBallPointerPresence();
  dockedBall?.resume();
  sendWindowState();
  if (animate) await waitForFloatingUiAnimation("show", snapshot);
  hiddenFloatingUiSnapshot = null;
  floatingUiAnimationActive = false;
}

function toggleFloatingUi() {
  if (floatingUiHidden) {
    void showFloatingUi();
  } else {
    void hideFloatingUi();
  }
}

function snapToNearbyEdge() {
  if (!mainWindow) return false;
  const bounds = mainWindow.getBounds();
  const snap = calculateNearbyDock(bounds, getDisplayFor(bounds), {
    threshold: EDGE_SNAP_THRESHOLD,
    currentEdge: edge,
    size: { width: bounds.width, height: bounds.height }
  });

  edge = normalizeDockEdge(snap.edge);
  if (snap.docked) {
    mainWindow.setBounds(snap.bounds, true);
  }

  saveState(mainWindow.getBounds());
  sendWindowState();
  return snap.docked;
}

function dockToNearestEdge() {
  if (!mainWindow) return false;
  const bounds = mainWindow.getBounds();
  const snap = snapToNearestEdge(bounds, getDisplayFor(bounds), {
    currentEdge: edge,
    size: { width: bounds.width, height: bounds.height },
    snapThreshold: EDGE_SNAP_THRESHOLD
  });
  edge = normalizeDockEdge(snap.edge);
  mainWindow.setBounds(snap.bounds, true);
  saveState(mainWindow.getBounds());
  sendWindowState();
  return true;
}

function smoothlyDockToNearestEdge() {
  if (!mainWindow || mainWindow.isDestroyed() || runtimeMode === RUNTIME_MODES.GAME || dragState) return false;
  fanMenu?.close();
  const bounds = mainWindow.getBounds();
  const snap = snapToNearestEdge(bounds, getDisplayFor(bounds), {
    currentEdge: edge,
    size: { width: bounds.width, height: bounds.height },
    snapThreshold: EDGE_SNAP_THRESHOLD
  });
  edge = normalizeDockEdge(snap.edge);
  cancelSnapAnimation?.();
  dockedBall?.dragStarted();
  cancelSnapAnimation = animateWindowBounds(mainWindow, snap.bounds, {
    duration: 300,
    onComplete: () => {
      cancelSnapAnimation = null;
      saveState(mainWindow.getBounds());
      dockedBall?.dragEnded(true);
      sendWindowState();
      syncDockedBallPointerPresence();
    }
  });
  return true;
}

function getBallDisplaySettings() {
  return {
    mode: ballDisplayMode,
    options: [
      { value: DISPLAY_MODES.FULL, label: "完整显示" },
      { value: DISPLAY_MODES.QUIET_EDGE, label: "静默贴边" }
    ]
  };
}

function getRuntimeModeSettings() {
  return {
    mode: runtimeMode,
    options: [
      { value: RUNTIME_MODES.NORMAL, label: "日常模式" },
      { value: RUNTIME_MODES.GAME, label: "游戏模式" }
    ]
  };
}

function synchronizeRuntimeModeState(regionSnapshot = gameSession?.snapshot?.()) {
  const state = gameRuntimeState(runtimeMode, regionSnapshot);
  hotkeyManager?.setContext({ mode: state.mode, gameRegionsActive: state.gameRegionsActive });
  if (runtimeMode === RUNTIME_MODES.GAME) {
    dockedBall?.setDisplayMode(BALL_DISPLAY_MODES.QUIET_EDGE);
    dockedBall?.setDocked(true);
  }
  sendWindowState();
  settingsWindow?.notifyRuntimeMode(getRuntimeModeSettings());
}

function sendFloatingBallNotice(message) {
  if (!message || floatingUiHidden || !mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) return;
  mainWindow.webContents.send("app-notice", message);
}

function setRuntimeMode(mode) {
  const next = normalizeRuntimeMode(mode);
  if (next === runtimeMode) return { ok: true, snapshot: getRuntimeModeSettings() };
  gameSession?.clearAll();
  if (regionCapture?.isCapturing()) regionCapture.cancel("runtime-mode-change");
  regionCapture?.cancelRecognition?.("runtime-mode-change");
  runtimeMode = next;
  runtimeModeStore?.save(next, null);
  if (viewState === "expanded") setExpanded(false);
  fanMenu?.close();
  if (runtimeMode === RUNTIME_MODES.GAME) {
    if (mainWindow && !mainWindow.isDestroyed() && !isBoundsDocked(mainWindow.getBounds())) dockToNearestEdge();
    dockedBall?.setDisplayMode(BALL_DISPLAY_MODES.QUIET_EDGE);
    dockedBall?.setDocked(true);
  } else {
    dockedBall?.setDisplayMode(
      ballDisplayMode === DISPLAY_MODES.QUIET_EDGE ? BALL_DISPLAY_MODES.QUIET_EDGE : BALL_DISPLAY_MODES.FULL
    );
    dockedBall?.setDocked(mainWindow ? isBoundsDocked(mainWindow.getBounds()) : false);
  }
  if (mainWindow && !mainWindow.isDestroyed()) saveState(mainWindow.getBounds());
  hotkeyManager?.setContext({ mode: runtimeMode, gameRegionsActive: false });
  sendWindowState();
  const snapshot = getRuntimeModeSettings();
  settingsWindow?.notifyRuntimeMode(snapshot);
  return { ok: true, snapshot };
}

function setBallDisplayMode(mode) {
  ballDisplayMode = normalizeDisplayMode(mode);
  if (!mainWindow || mainWindow.isDestroyed()) {
    return { ok: true, snapshot: getBallDisplaySettings() };
  }

  if (viewState === "expanded") {
    viewState = "collapsed";
    mainWindow.setBounds(collapsedBoundsFromExpanded(mainWindow.getBounds()), false);
    dockedBall?.menuClosed();
  }

  syncDockedBallPointerPresence();

  if (ballDisplayMode === DISPLAY_MODES.QUIET_EDGE) {
    if (!isBoundsDocked(mainWindow.getBounds())) dockToNearestEdge();
    dockedBall?.setDisplayMode(BALL_DISPLAY_MODES.QUIET_EDGE);
    dockedBall?.setDocked(true);
  } else {
    dockedBall?.setDisplayMode(BALL_DISPLAY_MODES.FULL);
    dockedBall?.setDocked(isBoundsDocked(mainWindow.getBounds()));
  }

  saveState(mainWindow.getBounds());
  sendWindowState();
  return { ok: true, snapshot: getBallDisplaySettings() };
}

function setExpanded(expanded) {
  if (!mainWindow) return;
  if (expanded && runtimeMode === RUNTIME_MODES.GAME) return;
  if (
    expanded &&
    [BALL_STATES.HIDING, BALL_STATES.DOCKED_HIDDEN, BALL_STATES.REVEALING]
      .includes(dockedBall?.state)
  ) {
    dockedBall?.reveal();
    return;
  }
  const nextState = expanded ? "expanded" : "collapsed";
  if (viewState === nextState) return;

  const bounds = mainWindow.getBounds();
  viewState = nextState;
  const nextBounds = expanded
    ? expandedBoundsFromCollapsed(bounds)
    : collapsedBoundsFromExpanded(bounds);

  mainWindow.setBounds(nextBounds, true);
  saveState(mainWindow.getBounds());
  if (expanded) {
    dockedBall?.menuOpened();
  } else {
    syncDockedBallPointerPresence();
    dockedBall?.menuClosed();
  }
  sendWindowState();
}

function collapseMenuForDrag() {
  if (!mainWindow || viewState !== "expanded") return;
  const collapsedBounds = collapsedBoundsFromExpanded(mainWindow.getBounds());
  viewState = "collapsed";
  mainWindow.setBounds(collapsedBounds, false);
  saveState(mainWindow.getBounds());
  sendWindowState();
}

function createWindow() {
  startupTiming.mark("T2 BrowserWindow create start");
  const initialBounds = collapsedBoundsFromSaved();
  mainWindow = new BrowserWindow({
    ...initialBounds,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: false,
    hasShadow: false,
    backgroundColor: "#00000000",
    icon: APP_ICON_PATH,
    title: APP_NAME,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  dockedBall?.dispose();
  dockedBall = new DockedBallStateMachine({
    ...DOCKED_BALL_CONFIG,
    displayMode: BALL_DISPLAY_MODES.FULL,
    onStateChange: handleDockedBallStateChange
  });
  dockedBall.setDisplayMode(
    runtimeMode === RUNTIME_MODES.GAME || ballDisplayMode === DISPLAY_MODES.QUIET_EDGE
      ? BALL_DISPLAY_MODES.QUIET_EDGE
      : BALL_DISPLAY_MODES.FULL
  );
  pointerPresenceMonitor?.stop();
  pointerPresenceMonitor = createPointerPresenceMonitor({
    sample: syncDockedBallPointerPresence
  });

  applyWindowAppDetails(mainWindow);
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  startupTiming.mark("T3 floating BrowserWindow created");
  mainWindow.webContents.once("did-finish-load", () => {
    startupTiming.mark("T4 renderer did-finish-load");
  });
  mainWindow.once("ready-to-show", () => {
    if (runtimeMode === RUNTIME_MODES.GAME) {
      if (!isBoundsDocked(mainWindow.getBounds())) dockToNearestEdge();
      dockedBall?.setDisplayMode(BALL_DISPLAY_MODES.QUIET_EDGE);
      dockedBall?.setDocked(true);
    } else {
      dockedBall?.setDocked(isBoundsDocked(mainWindow.getBounds()));
    }
    mainWindow.showInactive();
    maintainFloatingBallWindowLevel();
    syncDockedBallPointerPresence();
    pointerPresenceMonitor.start();
    startupTiming.mark("T5 floating BrowserWindow showInactive");
    sendWindowState();
  });
  mainWindow.on("closed", () => {
    pointerPresenceMonitor?.stop();
    pointerPresenceMonitor = null;
    dockedBall?.dispose();
    dockedBall = null;
    mainWindow = null;
  });
}

function showFloatingBall(message, { force = false } = {}) {
  if (regionCapture?.isActive()) return;
  if (floatingUiHidden) {
    if (!force) return;
    void showFloatingUi().then(() => {
      if (message && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("app-notice", message);
      }
    });
    return;
  }
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    if (message) {
      mainWindow.webContents.once("did-finish-load", () => {
        mainWindow?.webContents.send("app-notice", message);
      });
    }
    return;
  }

  if (!mainWindow.isVisible()) mainWindow.showInactive();
  dockedBall?.reveal();
  if (message) mainWindow.webContents.send("app-notice", message);
}

async function hideFloatingBallForCapture() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  floatingBallCaptureActive = true;
  capturePointerMonitorWasRunning = Boolean(pointerPresenceMonitor?.running);
  pointerPresenceMonitor?.stop();
  if (floatingUiHidden) {
    await new Promise((resolve) => setImmediate(resolve));
    return;
  }
  dockedBall?.suspend();
  mainWindow.setIgnoreMouseEvents(true, { forward: true });
  const bounds = mainWindow.getBounds();
  if (mainWindow.isVisible()) {
    await new Promise((resolve) => {
      mainWindow.once("hide", resolve);
      mainWindow.hide();
    });
  }
  if (viewState === "expanded") {
    viewState = "collapsed";
    const collapsedBounds = collapsedBoundsFromExpanded(bounds);
    mainWindow.setBounds(collapsedBounds, false);
    saveState(collapsedBounds);
    sendWindowState();
  }
  await new Promise((resolve) => setImmediate(resolve));
}

function restoreFloatingBallAfterCapture() {
  floatingBallCaptureActive = false;
  if (isQuitting || !mainWindow || mainWindow.isDestroyed()) {
    capturePointerMonitorWasRunning = false;
    return;
  }
  mainWindow.setIgnoreMouseEvents(false);
  if (floatingUiHidden) {
    capturePointerMonitorWasRunning = false;
    return;
  }
  if (!mainWindow.isVisible()) mainWindow.showInactive();
  dockedBall?.resume({ deferHide: true });
  syncDockedBallPointerPresence();
  sendWindowState();
  if (capturePointerMonitorWasRunning) pointerPresenceMonitor?.start();
  capturePointerMonitorWasRunning = false;
}

function handleFeatureAction(action, trigger = {}) {
  if (action === "toggleRuntimeMode") {
    setRuntimeMode(runtimeMode === RUNTIME_MODES.GAME ? RUNTIME_MODES.NORMAL : RUNTIME_MODES.GAME);
    return;
  }
  if (action === "toggleFloatingUi") {
    toggleFloatingUi();
    return;
  }
  if (action === "areaTranslation") {
    if (regionCapture?.isCapturing()) return;
    translationWindows?.closeTextInput();
    regionCapture?.start({
      triggeredAt: trigger.triggeredAt,
      translationMethod: languagePreferences?.readMethod("normalAlt2"),
      direction: languagePreferences?.read("normalAlt2")
    });
    return;
  }
  if (action === "textTranslation") {
    if (regionCapture?.isCapturing()) return;
    translationWindows?.openTextInput();
    return;
  }
  if (action === "localTranslation" || action === "gameLocalTranslation") {
    fanMenu?.close();
    localTranslationWindows?.open(runtimeMode);
    return;
  }
  if (action === "openSettings" || action === "gameOpenSettings") {
    fanMenu?.close();
    settingsWindow?.open();
    return;
  }
  if (action === "gameFullscreenRecognition") {
    if (runtimeMode !== RUNTIME_MODES.GAME) return;
    fanMenu?.close();
    void gameSession?.toggleFullscreen();
    return;
  }
  if (action === "gameRegionSelection") {
    if (runtimeMode !== RUNTIME_MODES.GAME) return;
    fanMenu?.close();
    void gameSession?.toggleRegionSelection(trigger);
    return;
  }
  if (action === "gameClearRegions") {
    if (runtimeMode !== RUNTIME_MODES.GAME) return;
    fanMenu?.close();
    gameSession?.clearAll();
    synchronizeRuntimeModeState(gameSession?.snapshot?.());
    sendFloatingBallNotice("游戏模式临时区域已清空");
    return;
  }
  if (action === "gameMenu") {
    fanMenu?.toggle();
    return;
  }
  if (regionCapture?.isCapturing()) return;
  if (action === "settings") settingsWindow?.open();
}

function cleanupServices() {
  if (cleanupPromise) return cleanupPromise;
  cleanupPromise = (async () => {
    hotkeyManager?.dispose();
    hotkeyManager = null;
    translationWindows?.closeAll();
    translationWindows = null;
    localTranslationWindows?.closeAll();
    localTranslationWindows = null;
    settingsWindow?.close();
    settingsWindow = null;
    regionCapture?.closeAll({ restoreBall: false });
    regionCapture = null;
    gameSession?.dispose();
    gameSession = null;
    fanMenu?.dispose();
    fanMenu = null;
    dockedBall?.dispose();
    const pending = [];
    if (ocrService) {
      pending.push(
        ocrService.dispose().catch((error) => {
          console.error("[ocr] shutdown failed", error?.message);
        })
      );
      ocrService = null;
    }
    if (translatorRuntime) {
      pending.push(
        translatorRuntime.dispose().catch((error) => {
          console.error("[qwen] shutdown failed", error?.message);
        })
      );
      translatorRuntime = null;
    }
    await Promise.all(pending);
  })();
  return cleanupPromise;
}

async function quitTranslator() {
  if (isQuitting) return;
  isQuitting = true;
  await cleanupServices();
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.destroy();
  }
  app.quit();
}

app.setName(APP_NAME);
app.setAppUserModelId(APP_ID);
const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (secondInstanceAction({ activelyHidden: floatingUiHidden }) === "restore") {
      void showFloatingUi();
    }
  });

  app.whenReady().then(() => {
    startupTiming.mark("T1 app ready");
    runtimeModeStore = new RuntimeModeStore(path.join(app.getPath("userData"), "runtime-mode.json"));
    const savedRuntimeMode = runtimeModeStore.loadState();
    runtimeMode = RUNTIME_MODES.NORMAL;
    normalModeSnapshot = savedRuntimeMode.normalSnapshot;
    translatorRuntime = createTranslatorRuntime();
    const { translatorService, translatorSettings } = translatorRuntime;
    startupTiming.mark("T1a translator settings/runtime objects created");
    languagePreferences = new LanguagePreferencesStore(
      path.join(app.getPath("userData"), "local-translation-languages.json")
    );
    translationWindows = new TranslationWindowController(
      translatorService,
      translatorSettings,
      { languagePreferences }
    );
    overlayStyleStore = new TranslationOverlayStyleStore(
      path.join(app.getPath("userData"), "translation-overlay-style.json")
    );
    localTranslationWindows = new LocalTranslationWindowController(
      translatorService,
      translatorSettings,
      {
        languagePreferences,
        onLanguagePreferencesChanged: (snapshot) => settingsWindow?.notifyLanguagePreferences(snapshot)
      }
    );
    createWindow();
    ocrService = createOcrRuntime(app.getPath("userData"));
    startupTiming.mark("T7 OCR runtime object created");
    regionCapture = new RegionCaptureController({
      ocrService,
      translatorService,
      onHideBall: hideFloatingBallForCapture,
      onRestoreBall: restoreFloatingBallAfterCapture,
      onNotice: (message) => showFloatingBall(message),
      getGamePreferences: (kind) => {
        const preferenceKey = kind === "region" ? "gameRegion" : "gameFullscreen";
        const direction = languagePreferences.read(preferenceKey);
        return {
          ...direction,
          translationMethod: languagePreferences.readMethod(preferenceKey),
          durationSeconds: languagePreferences.readAll().gameFullscreenDurationSeconds
        };
      },
      getOverlayStyle: (kind) => overlayStyleStore.resolve(kind),
      getOverlaySettings: () => overlayStyleStore.readAll()
    });
    startupTiming.mark("T8 region capture controller created");
    gameSession = new GameSessionController({
      regionCapture,
      onNotice: (message) => showFloatingBall(message),
      onRegionStateChange: (snapshot) => {
        synchronizeRuntimeModeState(snapshot);
      }
    });
    fanMenu = new FanMenuController({
      getAnchor: () => mainWindow && !mainWindow.isDestroyed()
        ? {
          bounds: stablePointerBounds() || mainWindow.getBounds(),
          edge,
          docked: isBoundsDocked(stablePointerBounds() || mainWindow.getBounds()),
          mode: runtimeMode
        }
        : null,
      onAction: handleFeatureAction,
      onOpen: () => dockedBall?.menuOpened(),
      onClose: () => {
        syncDockedBallPointerPresence();
        dockedBall?.menuClosed();
      }
    });
    hotkeyManager = new HotkeyManager(handleFeatureAction, {
      onRegistrationIssue: ({ action }) => {
        if (action === "gameClearRegions") showFloatingBall("清空区域快捷键注册失败，请在设置中更换");
      }
    });
    hotkeyManager.setContext({ mode: runtimeMode, gameRegionsActive: false });
    hotkeyManager.start();
    startupTiming.mark("T6 global hotkeys registered");
    settingsWindow = new SettingsWindowController(hotkeyManager, {
      translatorSettings,
      qwenRuntime: translatorRuntime.qwenRuntime,
      languagePreferences,
      overlayStyleStore,
      getBallDisplaySettings,
      setBallDisplayMode,
      getRuntimeModeSettings,
      setRuntimeMode,
      onShowBall: () => showFloatingBall(null, { force: true }),
      onQuit: quitTranslator
    });
    startupTiming.mark("T9 bootstrap complete");
  });
}

app.on("window-all-closed", () => {});
app.on("before-quit", (event) => {
  if (isQuitting) return;
  event.preventDefault();
  isQuitting = true;
  cleanupServices().finally(() => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.destroy();
    }
    app.quit();
  });
});

ipcMain.on("expand-menu", () => setExpanded(true));
ipcMain.on("collapse-menu", () => setExpanded(false));
ipcMain.on("toggle-fan-menu", (event) => {
  if (!mainWindow || event.sender.id !== mainWindow.webContents.id) return;
  fanMenu?.toggle();
});
ipcMain.on("snap-to-nearest-edge", (event) => {
  if (!mainWindow || event.sender.id !== mainWindow.webContents.id) return;
  smoothlyDockToNearestEdge();
});

ipcMain.on("trigger-feature", (event, action) => {
  if (!mainWindow || event.sender.id !== mainWindow.webContents.id) return;
  handleFeatureAction(action);
});

ipcMain.on("set-menu-height", (_event, height) => {
  if (!Number.isFinite(height) || height <= 0) return;
  const nextHeight = Math.ceil(height);
  if (nextHeight === expandedHeight) return;

  if (viewState === "expanded" && mainWindow) {
    const collapsedBounds = collapsedBoundsFromExpanded(mainWindow.getBounds());
    expandedHeight = nextHeight;
    mainWindow.setBounds(expandedBoundsFromCollapsed(collapsedBounds), true);
  } else {
    expandedHeight = nextHeight;
  }
});

ipcMain.on("ball-pointer-presence", (event, payload) => {
  if (!mainWindow || event.sender.id !== mainWindow.webContents.id) return;
  syncDockedBallPointerPresence();
});

ipcMain.on("ball-animation-finished", (event, animationState) => {
  if (!mainWindow || event.sender.id !== mainWindow.webContents.id) return;
  dockedBall?.completeAnimation(animationState);
});

ipcMain.on("animation-hit-regions", (event, payload) => {
  if (!mainWindow || event.sender.id !== mainWindow.webContents.id) return;
  if (!isCharacterAnimationState(dockedBall?.state) || dragState) return;
  animationHitPayload = normalizeAnimationHitPayload(payload);
  updateAnimationWindowInput();
});

ipcMain.on("drag-start", (event, payload) => {
  if (!mainWindow || event.sender.id !== mainWindow.webContents.id) return;
  const point = payload?.point || payload;
  if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return;

  if (isCharacterAnimationState(dockedBall?.state)) {
    const currentBounds = mainWindow.getBounds();
    const contextPayload = normalizeAnimationHitPayload({
      viewport: payload?.context?.viewport,
      regions: payload?.context?.visualBounds ? [payload.context.visualBounds] : []
    });
    const liveRegion = findAnimationHitRegion({
      point,
      windowBounds: currentBounds,
      ...animationHitPayload
    });
    const contextRegion = findAnimationHitRegion({
      point,
      windowBounds: currentBounds,
      ...contextPayload
    });
    const visualBounds = liveRegion || contextRegion;
    if (!visualBounds) return;
    animationDragTakeoverBounds = collapsedBoundsFromAnimationVisual({
      windowBounds: currentBounds,
      viewport: liveRegion ? animationHitPayload.viewport : contextPayload.viewport,
      visualBounds,
      grabPoint: point,
      displayBounds: getDisplayFor(currentBounds).bounds,
      collapsedSize: COLLAPSED,
      ballSize: DOCKED_BALL_CONFIG.ballDisplaySize,
      ballTop: collapsedBallTopForEdge()
    });
  }

  const gameEdgeDrag = runtimeMode === RUNTIME_MODES.GAME && dockedBall?.state === BALL_STATES.DOCKED_HIDDEN;
  cancelSnapAnimation?.();
  cancelSnapAnimation = null;
  fanMenu?.close();
  if (!gameEdgeDrag) dockedBall?.dragStarted();
  collapseMenuForDrag();
  dragState = {
    startPoint: point,
    startBounds: mainWindow.getBounds(),
    gameEdgeDrag,
    edge,
    displayBounds: getDisplayFor(mainWindow.getBounds()).bounds
  };
});

ipcMain.on("drag-move", (event, point) => {
  if (!mainWindow || event.sender.id !== mainWindow.webContents.id || !dragState) return;
  mainWindow.setBounds(dragState.gameEdgeDrag
    ? edgeTrackBounds({ ...dragState, point })
    : boundsFromDrag(dragState.startBounds, dragState.startPoint, point));
});

ipcMain.on("drag-end", (event, payload) => {
  if (!mainWindow || event.sender.id !== mainWindow.webContents.id) return;
  const moved = typeof payload === "object" ? payload.moved : payload;
  const point = typeof payload === "object" ? payload.point : null;
  const completedDrag = dragState;
  if (mainWindow && completedDrag && moved && point) {
    mainWindow.setBounds(completedDrag.gameEdgeDrag
      ? edgeTrackBounds({ ...completedDrag, point })
      : boundsFromDrag(completedDrag.startBounds, completedDrag.startPoint, point), false);
  }
  dragState = null;
  if (completedDrag?.gameEdgeDrag) {
    saveState(collapsedBoundsFromHidden(mainWindow.getBounds()));
    sendWindowState();
    syncDockedBallPointerPresence();
    return;
  }
  if (moved) {
    dockedBall?.dragEnded(snapToNearbyEdge());
  } else {
    dockedBall?.dragEnded(isBoundsDocked(mainWindow.getBounds()));
  }
  syncDockedBallPointerPresence();
});
