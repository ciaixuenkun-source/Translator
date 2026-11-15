const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");

test("Delete clear defers unregistering its own global shortcut until its callback returns", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "translator-hotkey-dispatch-"));
  const callbacks = new Map();
  const events = [];
  const deferred = [];
  const electron = {
    app: { getPath: () => directory },
    globalShortcut: {
      register(accelerator, callback) {
        callbacks.set(accelerator, callback);
        events.push(`register:${accelerator}`);
        return true;
      },
      unregister(accelerator) {
        callbacks.delete(accelerator);
        events.push(`unregister:${accelerator}`);
      }
    }
  };
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === "electron") return electron;
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const managerPath = require.resolve("../src/services/hotkeys/hotkey-manager");
    delete require.cache[managerPath];
    const { HotkeyManager } = require(managerPath);
    let manager;
    let callbackReturned = false;
    manager = new HotkeyManager((action) => {
      assert.equal(action, "gameClearRegions");
      manager.setContext({ gameRegionsActive: false });
      assert.equal(events.includes("unregister:Delete"), false);
      callbackReturned = true;
    }, { deferReconcile: (callback) => deferred.push(callback) });
    manager.context = { mode: "game", gameRegionsActive: true };
    manager.start();
    events.length = 0;

    callbacks.get("Delete")();
    assert.equal(callbackReturned, true);
    assert.equal(events.includes("unregister:Delete"), false);
    assert.equal(deferred.length, 1);
    deferred.shift()();
    assert.equal(events.includes("unregister:Delete"), true);
    manager.dispose();
  } finally {
    Module._load = originalLoad;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("one-action reset restores its complete default set without changing other categories", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "translator-hotkey-action-reset-"));
  const callbacks = new Map();
  const electron = {
    app: { getPath: () => directory },
    globalShortcut: {
      register(accelerator, callback) { callbacks.set(accelerator, callback); return true; },
      unregister(accelerator) { callbacks.delete(accelerator); }
    }
  };
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === "electron") return electron;
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const managerPath = require.resolve("../src/services/hotkeys/hotkey-manager");
    delete require.cache[managerPath];
    const { HotkeyManager } = require(managerPath);
    const manager = new HotkeyManager(() => {});
    manager.bindings.textTranslation = [{ id: "custom-text", type: "keyboard", accelerator: "Control+T" }];
    manager.bindings.gameFullscreenRecognition = [{ id: "custom-game", type: "keyboard", accelerator: "Control+G" }];
    manager.bindings.toggleFloatingUi = [{ id: "custom-common", type: "keyboard", accelerator: "Control+H" }];
    manager.store.defaults = {
      ...manager.store.defaults,
      textTranslation: [
        { id: "default-text-one", type: "keyboard", accelerator: "Alt+1" },
        { id: "default-text-two", type: "keyboard", accelerator: "Control+1" }
      ]
    };
    manager.start();

    manager.bindings.areaTranslation = [{ id: "conflicting-area", type: "keyboard", accelerator: "Alt+1" }];
    const conflict = manager.resetAction("textTranslation");
    assert.equal(conflict.ok, false);
    assert.match(conflict.message, /截图识别翻译/);
    assert.equal(manager.bindings.textTranslation[0].accelerator, "Control+T");
    manager.bindings.areaTranslation = [{ id: "restored-area", type: "keyboard", accelerator: "Alt+2" }];

    const result = manager.resetAction("textTranslation");
    assert.equal(result.ok, true);
    assert.deepEqual(manager.bindings.textTranslation.map((item) => item.accelerator), ["Alt+1", "Control+1"]);
    assert.equal(manager.bindings.gameFullscreenRecognition[0].accelerator, "Control+G");
    assert.equal(manager.bindings.toggleFloatingUi[0].accelerator, "Control+H");
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, "hotkeys.json"), "utf8")).bindings.textTranslation.map((item) => item.accelerator), ["Alt+1", "Control+1"]);
    manager.dispose();
  } finally {
    Module._load = originalLoad;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
