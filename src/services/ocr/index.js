const path = require("path");
const { OcrService } = require("./ocr-service");
const { TesseractOcrProvider } = require("./providers/tesseract-provider");
const { prepareStableTesseractRuntime } = require("./tesseract-runtime");

function createOcrRuntime(userDataPath) {
  let runtimePaths;
  try {
    runtimePaths = prepareStableTesseractRuntime(userDataPath);
    console.info("[ocr-runtime] stable runtime ready", {
      workerPath: runtimePaths.workerPath,
      corePath: runtimePaths.corePath
    });
  } catch (error) {
    console.error("[ocr-runtime] stable runtime preparation failed", {
      code: error?.code || "unknown",
      message: error?.message
    });
  }
  const provider = new TesseractOcrProvider({
    modelDirectory: path.join(userDataPath, "ocr-models"),
    runtimePaths,
    runtimeResolver: () => prepareStableTesseractRuntime(userDataPath)
  });
  try {
    provider.prepareLocalModels();
  } catch (error) {
    console.error("[ocr-runtime] local model preparation failed", {
      code: error?.code || "unknown",
      message: error?.message
    });
  }
  return new OcrService(provider);
}

module.exports = { createOcrRuntime };
