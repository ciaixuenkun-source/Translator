const path = require("path");
const sharp = require("sharp");

const ROOT = path.resolve(__dirname, "..");
const ASSETS = path.join(ROOT, "src", "renderer", "assets");
const CONFIG = {
  "peek-top.png": [[39, 17], [52, 18]],
  "peek-bottom.png": [[37, 71], [51, 73]],
  "peek-left.png": [[21, 37], [18, 52]],
  "peek-right.png": [[69, 37], [71, 52]]
};

async function recolorEyes(sourceName, centers) {
  const source = path.join(ASSETS, sourceName);
  const target = path.join(ASSETS, sourceName.replace(".png", "-game.png"));
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (!centers.some(([cx, cy]) => ((x - cx) ** 2 + (y - cy) ** 2) <= 18)) continue;
      const offset = (y * info.width + x) * 4;
      const [red, green, blue, alpha] = data.subarray(offset, offset + 4);
      if (alpha < 20 || red < 45 || red < green * 1.05 || red < blue * 1.05) continue;
      const light = Math.max(28, Math.min(230, Math.round((red + green + blue) / 3)));
      data[offset] = Math.round(light * 0.18);
      data[offset + 1] = Math.round(light * 0.62);
      data[offset + 2] = Math.min(255, Math.round(light * 1.35 + 35));
    }
  }
  await sharp(data, { raw: info }).png().toFile(target);
  return target;
}

async function main() {
  const outputs = [];
  for (const [name, centers] of Object.entries(CONFIG)) outputs.push(await recolorEyes(name, centers));
  process.stdout.write(`${outputs.join("\n")}\n`);
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { CONFIG, recolorEyes };
