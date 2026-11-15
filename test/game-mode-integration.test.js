const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

test("settings exposes a persisted manual normal and game mode switch", () => {
  const html = read("src/windows/settings/index.html");
  const renderer = read("src/windows/settings/renderer.js");
  const controller = read("src/windows/settings/settings-window-controller.js");
  assert.match(html, /id="runtimeModeOptions"/);
  assert.match(renderer, /saveRuntimeMode/);
  assert.match(controller, /save-runtime-mode/);
});

test("game mode keeps the peek quiet, supports edge dragging, and opens settings on double click", () => {
  const main = read("src/main.js");
  const renderer = read("src/renderer/renderer.js");
  assert.match(main, /runtimeMode === RUNTIME_MODES\.GAME[\s\S]*BALL_DISPLAY_MODES\.QUIET_EDGE/);
  assert.doesNotMatch(renderer, /currentRuntimeMode === "game"\) return;/);
  assert.match(main, /edgeTrackBounds/);
  assert.match(main, /saveState\(collapsedBoundsFromHidden\(mainWindow\.getBounds\(\)\)\)/);
  assert.match(renderer, /addEventListener\("dblclick"[\s\S]*triggerFeature\("settings"\)/);
});

test("game full-screen and region actions remain single-shot and cancellable", () => {
  const controller = read("src/services/game-mode/game-session-controller.js");
  const capture = read("src/services/region-capture/region-capture-controller.js");
  assert.match(controller, /toggleFullscreen/);
  assert.match(controller, /game-fullscreen-toggle/);
  assert.match(controller, /toggleRegionSelection/);
  assert.match(controller, /regions\.length >= 3/);
  assert.match(controller, /selectionOnly: true/);
  assert.match(controller, /addContinuousRegion/);
  assert.match(controller, /pauseContinuousRegions/);
  assert.match(controller, /resumeContinuousRegions/);
  assert.match(capture, /processFullScreenCapture/);
  assert.match(capture, /recognizeLayout[\s\S]*pageSegmentationMode:\s*PAGE_SEGMENTATION_MODES\.SPARSE_TEXT/);
  assert.match(capture, /recognizeLayout[\s\S]*signal:\s*task\.controller\.signal/);
  assert.match(capture, /extractSpatialText/);
  assert.match(capture, /groupSpatialTextRegions\(extractedRegions/);
  assert.match(capture, /selectTranslatableFullscreenRegions\(diagnosticRegions/);
  assert.match(capture, /selectTranslatableFullscreenRegions\(diagnosticRegions, preferences\.targetLanguage\)/);
  assert.match(capture, /extractSpatialText\(layout\.blocks, \{[\s\S]*maxRegions: Number\.POSITIVE_INFINITY,[\s\S]*diagnostics: extractionStats[\s\S]*\}\)/);
  assert.match(capture, /droppedByLimit/);
  assert.match(capture, /longSelectedRegions/);
  assert.match(capture, /translationSubmitted/);
  assert.match(capture, /fullscreenTranslationMode === LOCAL_MODE \? 1 : FULLSCREEN_TRANSLATION_CONCURRENCY/);
  assert.match(capture, /reason:\s*"no-translatable-text"/);
  assert.match(capture, /targetLanguage:\s*preferences\.targetLanguage \|\| "zh-CN"/);
  assert.match(capture, /clearContinuousRegions/);
  assert.match(capture, /focusable: false/);
  assert.match(capture, /overlay\.showInactive\(\)/);
  assert.doesNotMatch(capture, /overlay\.focus\(\)/);
  assert.doesNotMatch(capture, /overlay\.webContents\.focus\(\)/);
  assert.match(capture, /resolveGameText/);
  assert.match(capture, /captureFullScreen/);
  assert.match(capture, /screenRect/);
  assert.match(capture, /game-fullscreen-diagnostics\.jsonl/);
  assert.match(capture, /failureStage/);
  assert.match(capture, /translationFailed/);
  assert.match(capture, /overlayFailed/);
  assert.match(capture, /cancellationReason/);
  assert.match(capture, /translationNotSubmitted/);
  assert.match(capture, /captureImageSize/);
  assert.match(capture, /regions: Array\.isArray\(counts\.regions\)/);
  assert.doesNotMatch(capture, /regions:[^\n]*\.text/);
});

test("game menu provides the four requested commands and keyboard navigation", () => {
  const html = read("src/windows/game-menu/index.html");
  const renderer = read("src/windows/game-menu/renderer.js");
  for (const label of ["全屏识别翻译", "区域识别翻译", "设置", "关闭菜单"]) assert.match(html, new RegExp(label));
  assert.match(renderer, /ArrowDown/);
  assert.match(renderer, /ArrowUp/);
  assert.match(renderer, /Enter/);
  assert.match(renderer, /Escape/);
});

test("Delete clear action cannot quit, hide, close, or destroy the Translator main window", () => {
  const main = read("src/main.js");
  const clearAction = main.match(/if \(action === "gameClearRegions"\) \{[\s\S]*?\n  \}/)?.[0] || "";

  assert.match(clearAction, /gameSession\?\.clearAll\(\)/);
  assert.doesNotMatch(clearAction, /quitTranslator|app\.quit|mainWindow\.(?:hide|close|destroy)/);
});
