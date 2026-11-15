const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { ACTION_DEFINITIONS, DEFAULT_BINDINGS } = require("../src/services/hotkeys/defaults");
const { HotkeyStore } = require("../src/services/hotkeys/hotkey-store");

test("shortcut descriptions show only recommendations that match current defaults", () => {
  for (const [action, definition] of Object.entries(ACTION_DEFINITIONS)) {
    const recommended = DEFAULT_BINDINGS[action]?.[0]?.accelerator.replace(/^Control\+/, "Ctrl+");
    assert.equal(definition.recommendation, `推荐：${recommended}`);
    assert.doesNotMatch(definition.recommendation, /日常模式|游戏模式|用于|按下/);
  }
});

test("removes the retired fullscreen action without changing custom shortcuts", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "translator-hotkeys-"));
  const filePath = path.join(directory, "hotkeys.json");
  fs.writeFileSync(filePath, JSON.stringify({
    version: 2,
    bindings: {
      areaTranslation: [{ id: "area", type: "keyboard", accelerator: "Alt+2" }],
      fullscreenTranslation: [{ id: "fullscreen", type: "keyboard", accelerator: "Alt+4" }],
      textTranslation: [{ id: "text", type: "keyboard", accelerator: "Alt+1" }]
    }
  }));

  try {
    const loaded = new HotkeyStore(filePath, DEFAULT_BINDINGS).load();
    assert.deepEqual(Object.keys(loaded), [
      "textTranslation",
      "areaTranslation",
      "localTranslation",
      "openSettings",
      "gameFullscreenRecognition",
      "gameRegionSelection",
      "gameLocalTranslation",
      "gameOpenSettings",
      "gameMenu",
      "gameClearRegions",
      "toggleRuntimeMode",
      "toggleFloatingUi"
    ]);
    assert.equal(loaded.areaTranslation[0].accelerator, "Alt+2");
    assert.equal(loaded.textTranslation[0].accelerator, "Alt+1");
    assert.equal(loaded.localTranslation[0].accelerator, "Alt+3");
    assert.equal(loaded.openSettings[0].accelerator, "Alt+4");
    assert.equal(loaded.gameLocalTranslation[0].accelerator, "Alt+3");
    assert.equal(loaded.gameOpenSettings[0].accelerator, "Alt+4");
    assert.equal(loaded.toggleFloatingUi[0].accelerator, "Control+Shift+H");
    assert.equal(loaded.gameFullscreenRecognition[0].accelerator, "Alt+1");
    assert.equal(loaded.gameRegionSelection[0].accelerator, "Alt+2");
    assert.equal(loaded.toggleRuntimeMode[0].accelerator, "Control+Shift+F");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("migrates the former common Alt+3 and Alt+4 bindings into both modes", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "translator-hotkeys-"));
  const filePath = path.join(directory, "hotkeys.json");
  fs.writeFileSync(filePath, JSON.stringify({
    version: 2,
    bindings: {
      localTranslation: [{ id: "custom-translate", type: "keyboard", accelerator: "Control+T" }],
      openSettings: [{ id: "custom-settings", type: "keyboard", accelerator: "Control+Comma" }]
    }
  }));

  try {
    const loaded = new HotkeyStore(filePath, DEFAULT_BINDINGS).load();
    assert.equal(loaded.localTranslation[0].accelerator, "Control+T");
    assert.equal(loaded.openSettings[0].accelerator, "Control+Comma");
    assert.equal(loaded.gameLocalTranslation[0].accelerator, "Control+T");
    assert.equal(loaded.gameOpenSettings[0].accelerator, "Control+Comma");
    assert.notEqual(loaded.gameLocalTranslation[0].id, loaded.localTranslation[0].id);
    assert.notEqual(loaded.gameOpenSettings[0].id, loaded.openSettings[0].id);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("keeps an intentionally empty binding while filling newly introduced actions", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "translator-hotkeys-"));
  const filePath = path.join(directory, "hotkeys.json");
  fs.writeFileSync(filePath, JSON.stringify({
    version: 2,
    bindings: {
      areaTranslation: [],
      textTranslation: [{ id: "text", type: "keyboard", accelerator: "Alt+2" }]
    }
  }));

  try {
    const loaded = new HotkeyStore(filePath, DEFAULT_BINDINGS).load();
    assert.deepEqual(loaded.areaTranslation, []);
    assert.equal(loaded.textTranslation[0].accelerator, "Alt+2");
    assert.equal(loaded.localTranslation[0].accelerator, "Alt+3");
    assert.equal(loaded.openSettings[0].accelerator, "Alt+4");
    assert.equal(loaded.toggleFloatingUi[0].accelerator, "Control+Shift+H");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
