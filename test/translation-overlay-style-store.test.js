const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { TranslationOverlayStyleStore, normalizeOverlayStyles } = require("../src/services/region-capture/translation-overlay-style-store");

test("overlay style defaults tolerate missing and malformed old config", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "trans-style-")), "style.json");
  const store = new TranslationOverlayStyleStore(file);
  assert.equal(store.readAll().fullscreen.fontSize, 17);
  fs.writeFileSync(file, "not json", "utf8");
  assert.equal(store.readAll().region.textColor, "#fff7df");
});

test("overlay styles persist separately and shared mode resolves fullscreen style", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "trans-style-")), "style.json");
  const store = new TranslationOverlayStyleStore(file);
  store.write({ shareStyles: false, fullscreen: { fontSize: 22 }, region: { fontSize: 14 } });
  assert.equal(store.resolve("fullscreen").fontSize, 22);
  assert.equal(store.resolve("region").fontSize, 14);
  store.write({ shareStyles: true, fullscreen: { fontSize: 24 }, region: { fontSize: 13 } });
  assert.equal(store.resolve("region").fontSize, 24);
});

test("visual style sharing and position-animation sharing resolve independently", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "trans-style-")), "style.json");
  const store = new TranslationOverlayStyleStore(file);
  store.write({
    shareStyles: true,
    sharePositionAnimation: false,
    fullscreen: { fontSize: 25, position: "above-source", offsetX: 20 },
    region: { fontSize: 13, position: "right-source", offsetX: -8 }
  });
  assert.equal(store.resolve("region").fontSize, 25);
  assert.equal(store.resolve("region").position, "right-source");
  assert.equal(store.resolve("region").offsetX, -8);

  store.write({
    shareStyles: false,
    sharePositionAnimation: true,
    fullscreen: { fontSize: 25, position: "left-source", offsetY: 12 },
    region: { fontSize: 13, position: "below-source", offsetY: -4 }
  });
  assert.equal(store.resolve("region").fontSize, 13);
  assert.equal(store.resolve("region").position, "left-source");
  assert.equal(store.resolve("region").offsetY, 12);
});

test("overlay style values are safely normalized", () => {
  const result = normalizeOverlayStyles({ fullscreen: { fontSize: 999, textColor: "bad", position: "bad" } });
  assert.equal(result.fullscreen.fontSize, 40);
  assert.equal(result.fullscreen.textColor, "#fff7df");
  assert.equal(result.fullscreen.position, "near-source");
});

test("region display timing is persisted and duration stays below refresh interval", () => {
  const normalized = normalizeOverlayStyles({ regionRefreshIntervalMs: 900, regionOverlayDurationMs: 1200 });
  assert.equal(normalized.regionRefreshIntervalMs, 1000);
  assert.equal(normalized.regionOverlayDurationMs, 900);
  assert.ok(normalized.regionOverlayDurationMs < normalized.regionRefreshIntervalMs);
});

test("region refresh uses a one-second floor and keeps a precise 0.1-second display gap", () => {
  const tooFast = normalizeOverlayStyles({ regionRefreshIntervalMs: 200, regionOverlayDurationMs: 5000 });
  assert.equal(tooFast.regionRefreshIntervalMs, 1000);
  assert.equal(tooFast.regionOverlayDurationMs, 900);
  const threeSeconds = normalizeOverlayStyles({ regionRefreshIntervalMs: 3000, regionOverlayDurationMs: 5000 });
  assert.equal(threeSeconds.regionOverlayDurationMs, 2900);
});

test("text and background opacity accept exact zero and one endpoints", () => {
  const transparent = normalizeOverlayStyles({ fullscreen: { textOpacity: 0, backgroundOpacity: 0 } });
  const opaque = normalizeOverlayStyles({ fullscreen: { textOpacity: 1, backgroundOpacity: 1 } });
  assert.equal(transparent.fullscreen.textOpacity, 0);
  assert.equal(transparent.fullscreen.backgroundOpacity, 0);
  assert.equal(opaque.fullscreen.textOpacity, 1);
  assert.equal(opaque.fullscreen.backgroundOpacity, 1);
});
