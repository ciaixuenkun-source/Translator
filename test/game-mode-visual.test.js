const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");
const root = path.join(__dirname, "..");

test("game mode uses dedicated blue-eye peeks without a global hue filter", () => {
  const html = fs.readFileSync(path.join(root, "src/renderer/index.html"), "utf8");
  const css = fs.readFileSync(path.join(root, "src/renderer/styles.css"), "utf8");
  for (const edge of ["top", "bottom", "left", "right"]) {
    assert.match(html, new RegExp(`peek-${edge}-game\\.png`));
  }
  assert.doesNotMatch(css, /hue-rotate/i);
});

test("blue-eye peek assets retain the exact dimensions of normal peeks", async () => {
  for (const edge of ["top", "bottom", "left", "right"]) {
    const normal = await sharp(path.join(root, `src/renderer/assets/peek-${edge}.png`)).metadata();
    const game = await sharp(path.join(root, `src/renderer/assets/peek-${edge}-game.png`)).metadata();
    assert.equal(game.width, normal.width);
    assert.equal(game.height, normal.height);
  }
});
