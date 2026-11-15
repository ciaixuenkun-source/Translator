const path = require("node:path");
const sharp = require("sharp");

const root = path.join(__dirname, "..");
const source = path.join(root, "src/renderer/assets/translator-jump-doll.png");
const outDir = path.join(root, "src/renderer/assets");

const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
const PEEK_HEAD_SOURCE_WIDTH = 48;
const SIDE_PEEK_ROTATION_DEG = 88;
const PEEK_CANVAS = Object.freeze({ width: 90, height: 90 });

function canvas(width, height) {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: transparent
    }
  });
}

function headOnly() {
  return sharp(source)
    .ensureAlpha()
    .extract({ left: 0, top: 0, width: 917, height: 735 })
    .trim({ background: transparent, threshold: 1 });
}

async function makeSidePeeks() {
  const head = await headOnly()
    .resize({ width: PEEK_HEAD_SOURCE_WIDTH })
    .png()
    .toBuffer();

  const leftHead = await sharp(head)
    .rotate(SIDE_PEEK_ROTATION_DEG, { background: transparent })
    .png()
    .toBuffer();

  const left = await canvas(PEEK_CANVAS.width, PEEK_CANVAS.height)
    .composite([{ input: leftHead, left: 0, top: 21 }])
    .png()
    .toBuffer();

  await sharp(left).toFile(path.join(outDir, "peek-left.png"));
  await sharp(left).flop().toFile(path.join(outDir, "peek-right.png"));
}

async function makeTopBottomPeeks() {
  const head = await headOnly()
    .resize({ width: PEEK_HEAD_SOURCE_WIDTH })
    .png()
    .toBuffer();

  const bottom = await canvas(PEEK_CANVAS.width, PEEK_CANVAS.height)
    .composite([{ input: head, left: 21, top: 52 }])
    .png()
    .toBuffer();

  const topHead = await sharp(head)
    .rotate(180, { background: transparent })
    .png()
    .toBuffer();

  await canvas(PEEK_CANVAS.width, PEEK_CANVAS.height)
    .composite([{ input: topHead, left: 21, top: 0 }])
    .png()
    .toFile(path.join(outDir, "peek-top.png"));
  await sharp(bottom).toFile(path.join(outDir, "peek-bottom.png"));
}

async function main() {
  await makeTopBottomPeeks();
  await makeSidePeeks();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
