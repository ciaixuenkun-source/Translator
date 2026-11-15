const test = require("node:test");
const assert = require("node:assert/strict");
const {
  captureDisplayImage,
  cropCapturedImage,
  encodeSelectionBackdrop,
  warmupScreenCapture
} = require("../src/services/region-capture/screen-capture");

function fakeImage(size = { width: 1920, height: 1080 }) {
  return {
    isEmpty: () => false,
    getSize: () => size,
    crop: (rect) => ({ rect, getSize: () => ({ width: rect.width, height: rect.height }) })
  };
}

test("captures the source matching the current display at physical resolution", async () => {
  const thumbnail = fakeImage();
  let options;
  const result = await captureDisplayImage(
    {
      id: 22,
      bounds: { x: 1920, y: 0, width: 1280, height: 720 },
      scaleFactor: 1.5
    },
    {
      getSources: async (value) => {
        options = value;
        return [
          { id: "screen:1", display_id: "11", thumbnail: fakeImage() },
          { id: "screen:2", display_id: "22", thumbnail }
        ];
      }
    }
  );

  assert.deepEqual(options.thumbnailSize, { width: 1920, height: 1080 });
  assert.equal(result.image, thumbnail);
  assert.equal(result.sourceId, "screen:2");
  assert.deepEqual(result.imageSize, { width: 1920, height: 1080 });
});

test("warms up screen capture without retaining a stale screenshot", async () => {
  const calls = [];
  await warmupScreenCapture({
    getSources: async (options) => {
      calls.push(options);
      return [];
    }
  });

  assert.deepEqual(calls, [{
    types: ["screen"],
    thumbnailSize: { width: 1, height: 1 },
    fetchWindowIcons: false
  }]);
});

test("does not silently select the wrong display when several sources exist", async () => {
  await assert.rejects(
    captureDisplayImage(
      { id: 33, bounds: { width: 800, height: 600 }, scaleFactor: 1 },
      {
        getSources: async () => [
          { id: "screen:1", display_id: "11", thumbnail: fakeImage() },
          { id: "screen:2", display_id: "22", thumbnail: fakeImage() }
        ]
      }
    ),
    /无法获取当前屏幕截图/
  );
});

test("crops a captured image with the existing DPI-aware geometry", () => {
  const source = fakeImage({ width: 1920, height: 1080 });
  const result = cropCapturedImage(
    source,
    { x: 100, y: 80, width: 640, height: 320 },
    { width: 1536, height: 864 }
  );

  assert.deepEqual(result.pixelRect, {
    x: 125,
    y: 100,
    width: 800,
    height: 400,
    scaleX: 1.25,
    scaleY: 1.25
  });
  assert.deepEqual(result.image.getSize(), { width: 800, height: 400 });
});

test("reuses the captured image when the overlay covers the whole display", () => {
  let cropCount = 0;
  const source = {
    isEmpty: () => false,
    getSize: () => ({ width: 1920, height: 1080 }),
    crop: () => { cropCount += 1; }
  };
  const result = cropCapturedImage(
    source,
    { x: 0, y: 0, width: 1536, height: 864 },
    { width: 1536, height: 864 }
  );

  assert.equal(result.image, source);
  assert.equal(cropCount, 0);
});

test("encodes only the selection backdrop as fast JPEG without changing the OCR image", () => {
  const calls = [];
  const image = {
    toJPEG: (quality) => {
      calls.push(quality);
      return Buffer.from("selection-backdrop");
    },
    toPNG: () => {
      throw new Error("the selection backdrop must not run lossless OCR encoding");
    }
  };

  const result = encodeSelectionBackdrop(image);

  assert.deepEqual(calls, [95]);
  assert.equal(result.mimeType, "image/jpeg");
  assert.equal(result.quality, 95);
  assert.equal(result.buffer.toString(), "selection-backdrop");
});

test("uses a valid Windows native frame before Electron desktop capture", async () => {
  let electronCalls = 0;
  const nativeResult = fakeImage({ width: 1920, height: 1080 });
  const result = await captureDisplayImage({
    id: 1,
    bounds: { x: 0, y: 0, width: 1536, height: 864 },
    scaleFactor: 1.25
  }, {
    getSources: async () => { electronCalls += 1; return []; }
  }, {
    nativeCapture: async () => ({
      buffer: Buffer.alloc(8),
      rect: { x: 0, y: 0, width: 1920, height: 1080 }
    }),
    nativeImage: {
      createFromBitmap: () => nativeResult
    }
  });

  assert.equal(result.captureBackend, "windows-gdi");
  assert.equal(result.image, nativeResult);
  assert.equal(electronCalls, 0);
});

test("falls back once to Electron when Windows native capture fails", async () => {
  const fallbackReasons = [];
  let electronCalls = 0;
  const result = await captureDisplayImage({
    id: 1,
    bounds: { x: 0, y: 0, width: 800, height: 600 },
    scaleFactor: 1
  }, {
    getSources: async () => {
      electronCalls += 1;
      return [{ id: "screen:1", display_id: "1", thumbnail: fakeImage({ width: 800, height: 600 }) }];
    }
  }, {
    nativeCapture: async () => { throw Object.assign(new Error("helper exited"), { code: "native-failed" }); },
    nativeImage: { createFromBitmap: () => null },
    onNativeFallback: (reason) => fallbackReasons.push(reason)
  });

  assert.equal(result.captureBackend, "electron-desktop-capturer");
  assert.equal(electronCalls, 1);
  assert.deepEqual(fallbackReasons, ["native-failed"]);
});
