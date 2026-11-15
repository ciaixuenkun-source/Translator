const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("mascot input separates delayed single click, double click, right click and drag", () => {
  const renderer = read("src/renderer/renderer.js");
  assert.match(renderer, /setTimeout\([\s\S]*toggleFanMenu\(\)[\s\S]*240/);
  assert.match(renderer, /addEventListener\("dblclick"[\s\S]*cancelMenuToggle/);
  assert.match(renderer, /addEventListener\("contextmenu", requestNearestEdge\)/);
  assert.match(renderer, /Math\.hypot[\s\S]*DRAG_THRESHOLD/);
});

test("normal right click uses smooth nearest-edge docking while drag release keeps nearby-only docking", () => {
  const main = read("src/main.js");
  assert.match(main, /function smoothlyDockToNearestEdge/);
  assert.match(main, /duration:\s*300/);
  assert.match(main, /runtimeMode === RUNTIME_MODES\.GAME/);
  assert.match(main, /dragEnded\(snapToNearbyEdge\(\)\)/);
  assert.match(main, /fanMenu\?\.close\(\)[\s\S]*dragState/);
});

test("legacy expanded window path is no longer used by mascot or menu hotkey", () => {
  const main = read("src/main.js");
  const renderer = read("src/renderer/renderer.js");
  assert.match(main, /action === "gameMenu"[\s\S]*fanMenu\?\.toggle\(\)/);
  assert.doesNotMatch(renderer, /ballEl\.addEventListener\("click"[\s\S]{0,500}expandMenu\(\)/);
});
