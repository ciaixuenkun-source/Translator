const { app, desktopCapturer, nativeImage, screen } = require("electron");
const {
  captureDisplayImage,
  encodeSelectionBackdrop,
  warmupScreenCapture
} = require("../src/services/region-capture/screen-capture");

function summarize(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    averageMs: Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)),
    slowestMs: Number(Math.max(...values).toFixed(1)),
    fastestMs: Number(Math.min(...values).toFixed(1)),
    medianMs: Number(sorted[Math.floor(sorted.length / 2)].toFixed(1))
  };
}

async function measure(label, callback) {
  const startedAt = performance.now();
  const result = await callback();
  return { label, elapsedMs: performance.now() - startedAt, result };
}

app.whenReady().then(async () => {
  const display = screen.getPrimaryDisplay();
  await warmupScreenCapture(desktopCapturer);
  const samples = [];

  for (let index = 0; index < 5; index += 1) {
    const capture = await measure("desktopCapture", () => captureDisplayImage(display, desktopCapturer));
    const native = await measure("nativeCapture", () => captureDisplayImage(display, desktopCapturer, {
      nativeImage,
      displays: screen.getAllDisplays()
    }));
    const png = await measure("png", () => capture.result.image.toPNG());
    const jpeg = await measure("jpeg", () => encodeSelectionBackdrop(capture.result.image));
    samples.push({
      captureMs: capture.elapsedMs,
      nativeMs: native.elapsedMs,
      nativeBackend: native.result.captureBackend,
      pngMs: png.elapsedMs,
      jpegMs: jpeg.elapsedMs,
      pngBytes: png.result.length,
      jpegBytes: jpeg.result.buffer.length
    });
  }

  const result = {
    display: {
      width: display.bounds.width,
      height: display.bounds.height,
      scaleFactor: display.scaleFactor
    },
    sampleCount: samples.length,
    first: samples[0],
    desktopCapture: summarize(samples.map((sample) => sample.captureMs)),
    nativeCapture: summarize(samples.map((sample) => sample.nativeMs)),
    pngEncode: summarize(samples.map((sample) => sample.pngMs)),
    jpegEncode: summarize(samples.map((sample) => sample.jpegMs)),
    averagePngBytes: Math.round(samples.reduce((sum, sample) => sum + sample.pngBytes, 0) / samples.length),
    averageJpegBytes: Math.round(samples.reduce((sum, sample) => sum + sample.jpegBytes, 0) / samples.length)
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  app.quit();
}).catch((error) => {
  process.stderr.write(`${error?.stack || error}\n`);
  app.exit(1);
});
