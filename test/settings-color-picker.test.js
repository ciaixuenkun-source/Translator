const test = require("node:test");
const assert = require("node:assert/strict");
const {
  boardSelection,
  hexToHsv,
  hsvToHex,
  paletteStateForColor
} = require("../src/windows/settings/color-picker");

test("two-dimensional color board maps pointer position to saturation and value", () => {
  const rect = { left: 10, top: 20, width: 200, height: 100 };
  assert.deepEqual(boardSelection(110, 70, rect), { saturation: 50, value: 50 });
  assert.deepEqual(boardSelection(-20, 200, rect), { saturation: 0, value: 0 });
  assert.deepEqual(boardSelection(500, -10, rect), { saturation: 100, value: 100 });
});

test("first palette open derives every control state from its current saved color", () => {
  const text = paletteStateForColor("#fff7df");
  const background = paletteStateForColor("#000000");
  const outline = paletteStateForColor("#231713");
  assert.equal(text.displayHex, "#FFF7DF");
  assert.equal(background.displayHex, "#000000");
  assert.equal(outline.displayHex, "#231713");
  assert.equal(hsvToHex(text.hue, text.saturation, text.value), text.hex);
  assert.equal(hsvToHex(background.hue, background.saturation, background.value), background.hex);
  assert.equal(hsvToHex(outline.hue, outline.saturation, outline.value), outline.hex);
  assert.equal(paletteStateForColor(""), null);
});

test("switching palette targets keeps independent color state", () => {
  const colors = ["#112233", "#abcdef", "#884422"].map(paletteStateForColor);
  assert.deepEqual(colors.map((state) => state.hex), ["#112233", "#abcdef", "#884422"]);
  assert.equal(new Set(colors.map((state) => `${state.hue}:${state.saturation}:${state.value}`)).size, 3);
});

test("HSV hue, board coordinates, and HEX remain round-trip compatible", () => {
  for (const hex of ["#ff0000", "#00ff00", "#0000ff", "#fff7df", "#231713", "#000000", "#ffffff"]) {
    const hsv = hexToHsv(hex);
    assert.ok(hsv);
    assert.equal(hsvToHex(...hsv), hex);
  }
  assert.equal(hexToHsv("not-a-color"), null);
});
