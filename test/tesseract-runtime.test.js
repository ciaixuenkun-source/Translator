const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const sharp = require("sharp");
const packageJson = require("../package.json");
const {
  physicalPath,
  prepareStableTesseractRuntime,
  runtimeIsComplete
} = require("../src/services/ocr/tesseract-runtime");
const { TesseractOcrProvider } = require("../src/services/ocr/providers/tesseract-provider");

test("copies the Tesseract worker and core to a persistent user-data runtime", () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "translator-ocr-runtime-"));
  try {
    const paths = prepareStableTesseractRuntime(userData);
    assert.equal(fs.existsSync(paths.workerPath), true);
    assert.equal(fs.existsSync(paths.corePath), true);
    assert.equal(paths.workerPath.startsWith(path.join(userData, "ocr-runtime")), true);
    assert.equal(runtimeIsComplete(path.dirname(path.dirname(path.dirname(paths.corePath)))), true);

    const second = prepareStableTesseractRuntime(userData);
    assert.deepEqual(second, paths);
  } finally {
    fs.rmSync(userData, { recursive: true, force: true });
  }
});

test("maps packaged OCR resources from virtual app.asar to app.asar.unpacked", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "translator-asar-path-"));
  try {
    const virtualPath = path.join(root, "resources", "app.asar", "node_modules", "tesseract.js");
    const unpackedPath = path.join(root, "resources", "app.asar.unpacked", "node_modules", "tesseract.js");
    fs.mkdirSync(unpackedPath, { recursive: true });
    assert.equal(physicalPath(virtualPath), unpackedPath);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("portable packaging unpacks every persistent OCR runtime dependency", () => {
  const unpacked = packageJson.build.asarUnpack.join("\n");
  for (const packageName of [
    "tesseract.js",
    "tesseract.js-core",
    "bmp-js",
    "is-url",
    "regenerator-runtime",
    "wasm-feature-detect"
  ]) {
    assert.match(unpacked, new RegExp(`node_modules/${packageName.replace(".", "\\.")}`));
  }
});

test("starts a real Tesseract worker from the persistent runtime", async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "translator-ocr-worker-"));
  const provider = new TesseractOcrProvider({
    modelDirectory: path.join(userData, "models"),
    runtimePaths: prepareStableTesseractRuntime(userData),
    runtimeResolver: () => prepareStableTesseractRuntime(userData)
  });
  try {
    const image = await sharp({
      create: {
        width: 160,
        height: 60,
        channels: 3,
        background: "white"
      }
    }).png().toBuffer();
    const result = await provider.recognize(image);
    assert.equal(typeof result.text, "string");
  } finally {
    await provider.dispose();
    fs.rmSync(userData, { recursive: true, force: true });
  }
});
