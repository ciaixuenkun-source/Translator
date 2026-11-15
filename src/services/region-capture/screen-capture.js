const { mapCssRectToImagePixels } = require("./geometry");
const { captureWindowsDisplay } = require("./windows-native-capture");

async function captureDisplayImage(display, desktopCapturer, options = {}) {
  const requestedSize = {
    width: Math.round(display.bounds.width * display.scaleFactor),
    height: Math.round(display.bounds.height * display.scaleFactor)
  };
  const nativeStartedAt = Date.now();
  try {
    if (!options.nativeImage) throw Object.assign(new Error("native capture disabled"), { code: "native-disabled" });
    const nativeCapture = options.nativeCapture || captureWindowsDisplay;
    const captured = await nativeCapture(display, { displays: options.displays });
    const image = options.nativeImage?.createFromBitmap(captured.buffer, {
      width: captured.rect.width,
      height: captured.rect.height,
      scaleFactor: 1
    });
    if (!image || image.isEmpty()) throw Object.assign(new Error("native image conversion failed"), { code: "native-image-empty" });
    return {
      image,
      imageSize: image.getSize(),
      requestedSize,
      sourceId: "windows-gdi",
      captureBackend: "windows-gdi",
      nativeCaptureMs: Date.now() - nativeStartedAt
    };
  } catch (error) {
    if (options.onNativeFallback) options.onNativeFallback(error.code || "native-failed");
  }

  const electronStartedAt = Date.now();
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: requestedSize,
    fetchWindowIcons: false
  });
  const displayId = String(display.id);
  const source =
    sources.find((candidate) => candidate.display_id === displayId) ||
    (sources.length === 1 ? sources[0] : null);
  if (!source || source.thumbnail.isEmpty()) {
    throw new Error("无法获取当前屏幕截图");
  }

  return {
    image: source.thumbnail,
    imageSize: source.thumbnail.getSize(),
    requestedSize,
    sourceId: source.id,
    captureBackend: "electron-desktop-capturer",
    electronCaptureMs: Date.now() - electronStartedAt
  };
}

async function warmupScreenCapture(desktopCapturer) {
  await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: 1, height: 1 },
    fetchWindowIcons: false
  });
}

function encodeSelectionBackdrop(image, { quality = 95 } = {}) {
  const normalizedQuality = Math.min(100, Math.max(80, Math.round(Number(quality) || 95)));
  return {
    buffer: image.toJPEG(normalizedQuality),
    mimeType: "image/jpeg",
    quality: normalizedQuality
  };
}

function cropCapturedImage(image, cssRect, cssSize) {
  const imageSize = image.getSize();
  const pixelRect = mapCssRectToImagePixels(cssRect, cssSize, imageSize);
  const usesWholeImage = pixelRect.x === 0 && pixelRect.y === 0 &&
    pixelRect.width === imageSize.width && pixelRect.height === imageSize.height;
  return {
    image: usesWholeImage ? image : image.crop(pixelRect),
    pixelRect
  };
}

module.exports = {
  captureDisplayImage,
  cropCapturedImage,
  encodeSelectionBackdrop,
  warmupScreenCapture
};
