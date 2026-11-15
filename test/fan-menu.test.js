const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  BUTTON_SIZE,
  FAN_LAYOUT_OFFSETS,
  MENU_SIZE,
  SCREEN_SAFE_MARGIN,
  anchorInMenu,
  fanMenuBounds,
  fanMenuLayout,
  fanMenuNudge,
  fanMenuOffsets,
  layoutFitsWorkArea
} = require("../src/windows/fan-menu/geometry");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const display = {
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  workArea: { x: 0, y: 0, width: 1920, height: 1040 }
};

function centerOf(anchor) {
  return { x: anchor.x + anchor.width / 2, y: anchor.y + anchor.height / 2 };
}

function buttonRects(anchor, layout) {
  const center = centerOf(anchor);
  const radius = BUTTON_SIZE / 2;
  return fanMenuOffsets(layout).map((offset) => ({
    left: center.x + offset.x - radius,
    right: center.x + offset.x + radius,
    top: center.y + offset.y - radius,
    bottom: center.y + offset.y + radius
  }));
}

function overlaps(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function assertLayoutSafe(anchor, layout) {
  const area = display.workArea;
  const rects = buttonRects(anchor, layout);
  const mascot = { left: anchor.x, right: anchor.x + anchor.width, top: anchor.y, bottom: anchor.y + anchor.height };
  for (const rect of rects) {
    assert.ok(rect.left >= area.x + SCREEN_SAFE_MARGIN, `${layout} left boundary`);
    assert.ok(rect.right <= area.x + area.width - SCREEN_SAFE_MARGIN, `${layout} right boundary`);
    assert.ok(rect.top >= area.y + SCREEN_SAFE_MARGIN, `${layout} top boundary`);
    assert.ok(rect.bottom <= area.y + area.height - SCREEN_SAFE_MARGIN, `${layout} bottom boundary`);
    assert.equal(overlaps(rect, mascot), false, `${layout} must not cover mascot`);
  }
  for (let first = 0; first < rects.length; first += 1) {
    for (let second = first + 1; second < rects.length; second += 1) {
      assert.equal(overlaps(rects[first], rects[second]), false, `${layout} buttons ${first}/${second}`);
    }
  }
}

test("fan menu window stays in workArea while preserving the mascot screen anchor", () => {
  for (const anchor of [
    { x: 0, y: 160, width: 76, height: 76 },
    { x: 1844, y: 160, width: 76, height: 76 },
    { x: 600, y: 0, width: 76, height: 76 },
    { x: 600, y: 964, width: 76, height: 76 },
    { x: 760, y: 420, width: 76, height: 76 }
  ]) {
    const bounds = fanMenuBounds(anchor, display);
    const local = anchorInMenu(anchor, bounds);
    assert.ok(bounds.x >= display.workArea.x);
    assert.ok(bounds.y >= display.workArea.y);
    assert.ok(bounds.x + bounds.width <= display.workArea.x + display.workArea.width);
    assert.ok(bounds.y + bounds.height <= display.workArea.y + display.workArea.height);
    assert.equal(bounds.x + local.x, anchor.x + anchor.width / 2);
    assert.equal(bounds.y + local.y, anchor.y + anchor.height / 2);
  }
});

test("central menu surrounds the stationary mascot with four spacious corners", () => {
  const anchor = { x: 760, y: 420, width: 76, height: 76 };
  const layout = fanMenuLayout("floating", anchor, display);
  assert.equal(layout, "central-surround");
  assert.deepEqual(fanMenuOffsets(layout), [
    { x: -72, y: -72 },
    { x: 72, y: -72 },
    { x: -72, y: 72 },
    { x: 72, y: 72 }
  ]);
  assertLayoutSafe(anchor, layout);
});

test("ordinary docked positions use inward semicircle fans", () => {
  const cases = [
    ["left", { x: 0, y: 300, width: 76, height: 76 }, "edge-left-fan"],
    ["right", { x: 1844, y: 300, width: 76, height: 76 }, "edge-right-fan"],
    ["top", { x: 800, y: 0, width: 76, height: 76 }, "edge-top-fan"],
    ["bottom", { x: 800, y: 964, width: 76, height: 76 }, "edge-bottom-fan"]
  ];
  for (const [edge, anchor, expected] of cases) {
    const layout = fanMenuLayout(edge, anchor, display);
    assert.equal(layout, expected);
    assert.equal(layoutFitsWorkArea(anchor, display, layout), true);
    assertLayoutSafe(anchor, layout);
  }
});

test("edge fans form arcs instead of regular two-by-two matrices", () => {
  const left = fanMenuOffsets("edge-left-fan");
  assert.deepEqual(left.map(({ x }) => x), [70, 116, 116, 70]);
  assert.deepEqual(left.map(({ y }) => y), [-96, -34, 34, 96]);
  const top = fanMenuOffsets("edge-top-fan");
  assert.deepEqual(top.map(({ x }) => x), [-96, -34, 34, 96]);
  assert.deepEqual(top.map(({ y }) => y), [70, 116, 116, 70]);
});

test("all four cramped corners switch to inward compact grids", () => {
  const cases = [
    ["left", { x: 0, y: 0, width: 76, height: 76 }, "corner-top-left-grid"],
    ["right", { x: 1844, y: 0, width: 76, height: 76 }, "corner-top-right-grid"],
    ["left", { x: 0, y: 964, width: 76, height: 76 }, "corner-bottom-left-grid"],
    ["right", { x: 1844, y: 964, width: 76, height: 76 }, "corner-bottom-right-grid"]
  ];
  for (const [edge, anchor, expected] of cases) {
    const layout = fanMenuLayout(edge, anchor, display);
    assert.equal(layout, expected);
    assertLayoutSafe(anchor, layout);
  }
});

test("corner fallback returns to an edge fan after enough space is restored", () => {
  assert.equal(fanMenuLayout("left", { x: 0, y: 0, width: 76, height: 76 }, display), "corner-top-left-grid");
  assert.equal(fanMenuLayout("left", { x: 0, y: 170, width: 76, height: 76 }, display), "edge-left-fan");
  assert.equal(fanMenuLayout("top", { x: 0, y: 0, width: 76, height: 76 }, display), "corner-top-left-grid");
  assert.equal(fanMenuLayout("top", { x: 170, y: 0, width: 76, height: 76 }, display), "edge-top-fan");
});

test("dual-mode fan menu keeps four fixed actions and mode-specific primary commands", () => {
  const html = read("src/windows/fan-menu/index.html");
  const css = read("src/windows/fan-menu/styles.css");
  const renderer = read("src/windows/fan-menu/renderer.js");
  for (const label of ["文本", "区域", "翻译", "设置"]) assert.match(html, new RegExp(label));
  assert.match(html, /data-action="textTranslation"/);
  assert.match(html, /data-action="areaTranslation"/);
  assert.match(html, /data-action="placeholder"/);
  assert.match(html, /data-action="settings"/);
  assert.match(renderer, /primaryLabel\.textContent = "全屏"/);
  assert.match(renderer, /primaryLabel\.textContent = "文本"/);
  assert.match(renderer, /primaryButton\.dataset\.action = "gameFullscreenRecognition"/);
  assert.match(renderer, /regionButton\.dataset\.action = "gameRegionSelection"/);
  assert.match(renderer, /translateButton\.dataset\.action = "localTranslation"/);
  assert.equal((renderer.match(/translateButton\.dataset\.action = "localTranslation"/g) || []).length, 2);
  assert.doesNotMatch(css, /display:\s*none/);
  assert.match(css, /animation:\s*fan-open 1s/);
});

test("geometry is supplied by the controller instead of duplicated CSS position rules", () => {
  const controller = read("src/windows/fan-menu/controller.js");
  const renderer = read("src/windows/fan-menu/renderer.js");
  const css = read("src/windows/fan-menu/styles.css");
  assert.match(controller, /layout = fanMenuLayout\(edge, anchor\.bounds, display\)/);
  assert.match(controller, /offsets: fanMenuOffsets\(layout\)/);
  assert.match(renderer, /state\.offsets\?\.\[index\]/);
  assert.match(renderer, /--tx/);
  assert.match(renderer, /layout-\$\{state\.layout\}/);
  assert.doesNotMatch(css, /edge-left-upper/);
  assert.doesNotMatch(css, /\.edge-left \.item-primary/);
});

test("transparent fan window enables input only over real buttons", () => {
  const preload = read("src/windows/fan-menu/preload.js");
  const controller = read("src/windows/fan-menu/controller.js");
  const renderer = read("src/windows/fan-menu/renderer.js");
  assert.match(controller, /setIgnoreMouseEvents\(!interactive, \{ forward: true \}\)/);
  assert.match(preload, /action: \(action\) => ipcRenderer\.send\("fan-menu-action", action\)/);
  assert.match(controller, /ipcMain\.on\("fan-menu-action"/);
  assert.match(controller, /this\.close\(\);[\s\S]*this\.onAction\(action\)/);
  assert.match(renderer, /closest\?\.\("\.fan-item"\)/);
});

test("fan buttons remain fifty-seven pixels with the existing visual treatment", () => {
  const css = read("src/windows/fan-menu/styles.css");
  assert.equal(BUTTON_SIZE, 57);
  assert.match(css, /width:\s*57px; height:\s*57px/);
  assert.match(css, /\.fan-item img \{ width: 22px; height: 22px/);
  assert.match(css, /white-space:\s*nowrap/);
  assert.deepEqual(MENU_SIZE, { width: 300, height: 300 });
});

test("menu window safety nudge does not move valid layouts away from the mascot", () => {
  const cases = [
    [{ x: 150, y: 150 }, "central-surround"],
    [{ x: 38, y: 150 }, "edge-left-fan"],
    [{ x: 38, y: 38 }, "corner-top-left-grid"],
    [{ x: 262, y: 262 }, "corner-bottom-right-grid"]
  ];
  for (const [anchor, layout] of cases) assert.deepEqual(fanMenuNudge(anchor, layout), { x: 0, y: 0 });
});

test("fan menu keeps a notice channel for future unfinished actions", () => {
  const renderer = read("src/windows/fan-menu/renderer.js");
  const html = read("src/windows/fan-menu/index.html");
  const css = read("src/windows/fan-menu/styles.css");
  assert.match(html, /id="notice"/);
  assert.match(renderer, /button\.dataset\.action === "placeholder"/);
  assert.match(renderer, /showNotice\(/);
  assert.match(css, /\.fan-notice/);
});

test("main process keeps fan menu actions wired to existing feature handling", () => {
  const main = read("src/main.js");
  assert.match(main, /onAction:\s*handleFeatureAction/);
  assert.match(main, /action === "textTranslation"[\s\S]*translationWindows\?\.openTextInput\(\)/);
  assert.match(main, /action === "areaTranslation"[\s\S]*regionCapture\?\.start\(\{[\s\S]*triggeredAt: trigger\.triggeredAt[\s\S]*readMethod\("normalAlt2"\)/);
  assert.match(main, /action === "gameFullscreenRecognition"[\s\S]*gameSession\?\.toggleFullscreen\(\)/);
  assert.match(main, /action === "gameRegionSelection"[\s\S]*gameSession\?\.toggleRegionSelection\(trigger\)/);
  assert.match(main, /action === "localTranslation"[\s\S]*localTranslationWindows\?\.open\(runtimeMode\)/);
  assert.match(main, /action === "settings"[\s\S]*settingsWindow\?\.open\(\)/);
});
