const fs = require("fs");
const path = require("path");
const { createWorker, OEM, PSM } = require("tesseract.js");
const { OcrError } = require("../errors");
const { physicalPath } = require("../tesseract-runtime");

const LANGUAGES = ["eng", "chi_sim"];
const MODEL_VARIANT = "4.0.0_best_int";
const PAGE_SEGMENTATION_MODES = Object.freeze({
  SINGLE_BLOCK: "single-block",
  SPARSE_TEXT: "sparse-text"
});

function pageSegmentationValue(mode) {
  return mode === PAGE_SEGMENTATION_MODES.SPARSE_TEXT
    ? PSM.SPARSE_TEXT
    : PSM.SINGLE_BLOCK;
}

function tesseractRuntimePaths() {
  return {
    workerPath: require.resolve("tesseract.js/src/worker-script/node/index.js"),
    corePath: require.resolve("tesseract.js-core")
  };
}

function assertTesseractRuntimeFiles(runtimePaths = tesseractRuntimePaths()) {
  for (const [name, filePath] of Object.entries(runtimePaths)) {
    if (!fs.existsSync(filePath)) {
      const error = new Error(`Tesseract ${name} is missing: ${filePath}`);
      error.code = "tesseract-runtime-missing";
      throw error;
    }
  }
  return runtimePaths;
}

function packageModelPath(packageName, language) {
  const packageRoot = physicalPath(path.dirname(require.resolve(`${packageName}/package.json`)));
  return path.join(packageRoot, MODEL_VARIANT, `${language}.traineddata.gz`);
}

class TesseractOcrProvider {
  constructor({ modelDirectory, runtimePaths, runtimeResolver, workerFactory } = {}) {
    this.modelDirectory = modelDirectory;
    this.runtimePaths = runtimePaths || null;
    this.runtimeResolver = runtimeResolver || tesseractRuntimePaths;
    this.workerFactory = workerFactory || createWorker;
    this.workerPromise = null;
    this.worker = null;
    this.progressListener = null;
    this.disposed = false;
    this.generation = 0;
  }

  prepareLocalModels() {
    fs.mkdirSync(this.modelDirectory, { recursive: true });
    const models = [
      ["@tesseract.js-data/eng", "eng"],
      ["@tesseract.js-data/chi_sim", "chi_sim"]
    ];

    for (const [packageName, language] of models) {
      const source = packageModelPath(packageName, language);
      const destination = path.join(
        this.modelDirectory,
        `${language}.traineddata.gz`
      );
      const sourceSize = fs.statSync(source).size;
      const destinationSize = fs.existsSync(destination)
        ? fs.statSync(destination).size
        : -1;
      if (sourceSize !== destinationSize) fs.copyFileSync(source, destination);
    }
  }

  async getWorker() {
    if (this.disposed) {
      throw new OcrError("本地 OCR 已停止", { code: "ocr-disposed" });
    }
    if (this.worker) return this.worker;
    if (!this.workerPromise) {
      const workerPromise = this.createWorker().catch((error) => {
        if (this.workerPromise === workerPromise) this.workerPromise = null;
        throw error;
      });
      this.workerPromise = workerPromise;
    }
    return this.workerPromise;
  }

  async createWorker() {
    const generation = this.generation;
    try {
      this.prepareLocalModels();
      if (!this.runtimePaths) this.runtimePaths = this.runtimeResolver();
      const runtimePaths = assertTesseractRuntimeFiles(this.runtimePaths);
      const worker = await this.workerFactory(LANGUAGES, OEM.LSTM_ONLY, {
        workerPath: runtimePaths.workerPath,
        corePath: runtimePaths.corePath,
        langPath: this.modelDirectory,
        cacheMethod: "none",
        gzip: true,
        logger: (message) => this.progressListener?.(message)
      });
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        preserve_interword_spaces: "1"
      });
      if (this.disposed || generation !== this.generation) {
        await worker.terminate();
        throw new OcrError("本地 OCR 已停止", { code: "ocr-disposed" });
      }
      this.worker = worker;
      return worker;
    } catch (error) {
      this.runtimePaths = null;
      throw new OcrError("本地 OCR 初始化失败", {
        code: "ocr-initialization-failed",
        cause: error
      });
    }
  }

  async recognize(image, {
    onProgress,
    signal,
    pageSegmentationMode = PAGE_SEGMENTATION_MODES.SINGLE_BLOCK
  } = {}) {
    this.progressListener = onProgress || null;
    const abort = () => this.cancel();
    signal?.addEventListener("abort", abort, { once: true });
    try {
      if (signal?.aborted) {
        throw new OcrError("OCR cancelled", { code: "ocr-cancelled" });
      }
      const worker = await this.getWorker();
      await worker.setParameters({
        tessedit_pageseg_mode: pageSegmentationValue(pageSegmentationMode),
        preserve_interword_spaces: "1"
      });
      const result = await worker.recognize(image, {}, {
        text: true,
        blocks: true
      });
      return {
        text: result.data.text || "",
        blocks: result.data.blocks || []
      };
    } catch (error) {
      if (error instanceof OcrError) throw error;
      this.invalidateWorker("recognition-failed", error);
      throw new OcrError("文字识别失败", { cause: error });
    } finally {
      signal?.removeEventListener("abort", abort);
      this.progressListener = null;
    }
  }

  cancel() {
    this.generation += 1;
    const worker = this.worker;
    const workerPromise = this.workerPromise;
    this.worker = null;
    this.workerPromise = null;
    this.progressListener = null;
    if (worker) void worker.terminate().catch(() => {});
    else if (workerPromise) {
      void workerPromise.then((pending) => pending.terminate()).catch(() => {});
    }
  }

  invalidateWorker(reason, error) {
    this.generation += 1;
    const worker = this.worker;
    this.worker = null;
    this.workerPromise = null;
    this.progressListener = null;
    console.error("[ocr-worker] discarded failed worker", {
      reason,
      code: error?.code || "unknown",
      message: error?.message
    });
    if (worker) void worker.terminate().catch(() => {});
  }

  async dispose() {
    this.disposed = true;
    let worker = this.worker;
    if (!worker && this.workerPromise) {
      try {
        worker = await this.workerPromise;
      } catch {}
    }
    this.worker = null;
    this.workerPromise = null;
    this.progressListener = null;
    if (worker) await worker.terminate();
  }
}

module.exports = {
  PAGE_SEGMENTATION_MODES,
  TesseractOcrProvider,
  assertTesseractRuntimeFiles,
  pageSegmentationValue,
  tesseractRuntimePaths
};
