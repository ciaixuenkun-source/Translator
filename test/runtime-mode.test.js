const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { RUNTIME_MODES, RuntimeModeStore } = require("../src/services/runtime-mode/runtime-mode-store");
const { ACTION_DEFINITIONS } = require("../src/services/hotkeys/defaults");
const { actionIsActive, actionsCanConflict } = require("../src/services/hotkeys/hotkey-policy");

test("runtime mode persists manual game selection and normalizes invalid data", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "trans-mode-"));
  const file = path.join(directory, "runtime-mode.json");
  try {
    const store = new RuntimeModeStore(file);
    assert.equal(store.load(), RUNTIME_MODES.NORMAL);
    assert.equal(store.save(RUNTIME_MODES.GAME), RUNTIME_MODES.GAME);
    assert.equal(store.load(), RUNTIME_MODES.GAME);
    fs.writeFileSync(file, JSON.stringify({ mode: "automatic" }));
    assert.equal(store.load(), RUNTIME_MODES.NORMAL);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("runtime mode preserves the pre-game floating UI snapshot", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "trans-mode-"));
  const file = path.join(directory, "runtime-mode.json");
  const snapshot = { edge: "left", bounds: { x: 0, y: 140, width: 76, height: 76 }, displayMode: "full" };
  try {
    const store = new RuntimeModeStore(file);
    store.save(RUNTIME_MODES.GAME, snapshot);
    assert.deepEqual(store.loadState(), { mode: RUNTIME_MODES.GAME, normalSnapshot: snapshot });
    store.save(RUNTIME_MODES.NORMAL);
    assert.deepEqual(store.loadState().normalSnapshot, snapshot);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("normal and game actions reuse Alt shortcuts without active-mode conflicts", () => {
  assert.equal(actionIsActive(ACTION_DEFINITIONS.textTranslation, { mode: "normal" }), true);
  assert.equal(actionIsActive(ACTION_DEFINITIONS.localTranslation, { mode: "normal" }), true);
  assert.equal(actionIsActive(ACTION_DEFINITIONS.gameFullscreenRecognition, { mode: "normal" }), false);
  assert.equal(actionIsActive(ACTION_DEFINITIONS.textTranslation, { mode: "game" }), false);
  assert.equal(actionIsActive(ACTION_DEFINITIONS.localTranslation, { mode: "game" }), false);
  assert.equal(actionIsActive(ACTION_DEFINITIONS.gameLocalTranslation, { mode: "normal" }), false);
  assert.equal(actionIsActive(ACTION_DEFINITIONS.gameLocalTranslation, { mode: "game" }), true);
  assert.equal(actionIsActive(ACTION_DEFINITIONS.openSettings, { mode: "normal" }), true);
  assert.equal(actionIsActive(ACTION_DEFINITIONS.openSettings, { mode: "game" }), false);
  assert.equal(actionIsActive(ACTION_DEFINITIONS.gameOpenSettings, { mode: "normal" }), false);
  assert.equal(actionIsActive(ACTION_DEFINITIONS.gameOpenSettings, { mode: "game" }), true);
  assert.equal(actionIsActive(ACTION_DEFINITIONS.gameFullscreenRecognition, { mode: "game" }), true);
  assert.equal(actionsCanConflict(ACTION_DEFINITIONS.textTranslation, ACTION_DEFINITIONS.gameFullscreenRecognition), false);
  assert.equal(actionsCanConflict(ACTION_DEFINITIONS.localTranslation, ACTION_DEFINITIONS.gameLocalTranslation), false);
  assert.equal(actionsCanConflict(ACTION_DEFINITIONS.gameLocalTranslation, ACTION_DEFINITIONS.gameOpenSettings), true);
  assert.equal(actionsCanConflict(ACTION_DEFINITIONS.gameLocalTranslation, ACTION_DEFINITIONS.gameMenu), true);
  assert.equal(actionsCanConflict(ACTION_DEFINITIONS.toggleFloatingUi, ACTION_DEFINITIONS.gameMenu), true);
});

test("game clear shortcut is active only while regions need clearing", () => {
  const definition = ACTION_DEFINITIONS.gameClearRegions;
  assert.equal(actionIsActive(definition, { mode: "game", gameRegionsActive: false }), false);
  assert.equal(actionIsActive(definition, { mode: "game", gameRegionsActive: true }), true);
});
