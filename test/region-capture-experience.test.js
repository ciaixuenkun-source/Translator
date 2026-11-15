const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  calculatePreviewHeight,
  estimateVisualLines
} = require("../src/services/region-capture/preview-window-size");
const {
  writePngImageToClipboard
} = require("../src/services/region-capture/image-clipboard");

test("keeps short region translations compact and grows for long content", () => {
  const shortHeight = calculatePreviewHeight({
    sourceText: "Web of Science",
    translatedText: "科学网",
    workAreaHeight: 900
  });
  const longHeight = calculatePreviewHeight({
    sourceText: "source ".repeat(500),
    translatedText: "译文".repeat(700),
    workAreaHeight: 900
  });

  assert.equal(shortHeight, 300);
  assert.equal(longHeight, 565);
  assert.ok(longHeight > shortHeight);
});

test("preview height respects a small display work area", () => {
  assert.equal(calculatePreviewHeight({
    sourceText: "text ".repeat(1000),
    translatedText: "译文".repeat(1000),
    warningVisible: true,
    captureExpanded: true,
    workAreaHeight: 500
  }), 476);
});

test("visual line estimation accounts for wrapping and explicit lines", () => {
  assert.equal(estimateVisualLines("one\ntwo", 10), 2);
  assert.equal(estimateVisualLines("12345678901", 10), 2);
});

test("writes a PNG through the Electron 44 ClipboardItem API", async () => {
  const writes = [];
  class FakeBlob {
    constructor(parts, options) {
      this.parts = parts;
      this.type = options.type;
    }
  }
  class FakeClipboardItem {
    constructor(items) {
      this.items = items;
    }
  }
  const size = await writePngImageToClipboard(Buffer.from("png"), {
    nativeImage: {
      createFromBuffer: () => ({
        isEmpty: () => false,
        toPNG: () => Buffer.from("encoded"),
        getSize: () => ({ width: 40, height: 30 })
      })
    },
    ClipboardItem: FakeClipboardItem,
    BlobType: FakeBlob,
    clipboard: {
      write: async (items) => writes.push(items),
      has: async (type) => type === "image/png"
    }
  });

  assert.deepEqual(size, { width: 40, height: 30 });
  assert.equal(writes.length, 1);
  assert.equal(writes[0][0].items["image/png"].type, "image/png");
});

test("reports clipboard write failure without touching OCR concerns", async () => {
  await assert.rejects(writePngImageToClipboard(Buffer.from("png"), {
    nativeImage: {
      createFromBuffer: () => ({
        isEmpty: () => false,
        toPNG: () => Buffer.from("encoded"),
        getSize: () => ({ width: 1, height: 1 })
      })
    },
    ClipboardItem: class { constructor(items) { this.items = items; } },
    BlobType: class {},
    clipboard: {
      write: async () => { throw new Error("clipboard locked"); },
      has: async () => false
    }
  }), /clipboard locked/);
});

test("region preview uses a transient copy notice instead of a fixed copy button", () => {
  const previewHtml = fs.readFileSync(
    path.join(__dirname, "../src/services/region-capture/preview/index.html"),
    "utf8"
  );

  assert.match(previewHtml, /id="copyNotice"/);
  assert.doesNotMatch(previewHtml, /id="copyImageButton"/);
});

test("closing a region preview cancels OCR and releases the active task", () => {
  const controller = fs.readFileSync(
    path.join(__dirname, "../src/services/region-capture/region-capture-controller.js"),
    "utf8"
  );

  assert.match(controller, /preview\.on\("closed"[\s\S]*cancelOcrTask\("preview-closed"\)/);
  assert.match(controller, /closePreview\(\{ cancelRecognition = true \} = \{\}\)/);
  assert.match(controller, /cancelOcrTask\("preview-closed"\)/);
  assert.match(controller, /this\.ocrTask = null;[\s\S]*this\.ocrService\.cancelActive/);
});

test("selection overlay reports readiness only after the shown frame is painted", () => {
  const controller = fs.readFileSync(
    path.join(__dirname, "../src/services/region-capture/region-capture-controller.js"),
    "utf8"
  );
  const renderer = fs.readFileSync(
    path.join(__dirname, "../src/services/region-capture/overlay/renderer.js"),
    "utf8"
  );

  assert.match(controller, /encodeSelectionBackdrop\(session\.screenshot\)/);
  assert.match(controller, /overlay\.showInactive\(\);[\s\S]*region-capture-shown/);
  assert.match(renderer, /onShown[\s\S]*requestAnimationFrame[\s\S]*interactive/);
  assert.doesNotMatch(renderer, /capture\.screenshotPng/);
});
