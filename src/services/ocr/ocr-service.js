const { normalizeOcrResult } = require("./normalize-text");
const { OcrError } = require("./errors");
const {
  normalizeLocalTextPolarity
} = require("./preprocessing/local-polarity-normalizer");

class OcrService {
  constructor(provider, { preprocess = normalizeLocalTextPolarity } = {}) {
    this.provider = provider;
    this.preprocess = preprocess;
    this.activeRecognition = null;
    this.activeController = null;
  }

  recognize(image, options = {}) {
    return this.runRecognition(image, options, false);
  }

  recognizeLayout(image, options = {}) {
    return this.runRecognition(image, options, true);
  }

  runRecognition(image, options = {}, includeLayout = false) {
    if (this.activeRecognition) {
      throw new OcrError("已有文字识别任务正在进行", { code: "ocr-busy" });
    }

    const controller = new AbortController();
    const externalSignal = options.signal;
    const abortFromExternal = () => controller.abort();
    if (externalSignal?.aborted) controller.abort();
    else externalSignal?.addEventListener("abort", abortFromExternal, { once: true });
    this.activeController = controller;
    const recognition = Promise.resolve()
      .then(() => this.preprocess(image, { signal: controller.signal }))
      .then((preparedImage) => {
        if (controller.signal.aborted) {
          throw new OcrError("OCR cancelled", { code: "ocr-cancelled" });
        }
        let removeAbortListener = () => {};
        const cancelled = new Promise((_resolve, reject) => {
          const onAbort = () => reject(new OcrError("OCR cancelled", {
            code: "ocr-cancelled"
          }));
          controller.signal.addEventListener("abort", onAbort, { once: true });
          removeAbortListener = () => controller.signal.removeEventListener("abort", onAbort);
        });
        const providerRecognition = this.provider.recognize(preparedImage, {
          ...options,
          signal: controller.signal
        });
        return Promise.race([providerRecognition, cancelled])
          .finally(removeAbortListener);
      })
      .then((result) => includeLayout ? ({
          text: normalizeOcrResult(result),
          blocks: Array.isArray(result?.blocks) ? result.blocks : []
        }) : normalizeOcrResult(result))
      .finally(() => {
        externalSignal?.removeEventListener("abort", abortFromExternal);
        if (this.activeRecognition === recognition) {
          this.activeRecognition = null;
          this.activeController = null;
        }
      });
    this.activeRecognition = recognition;
    return recognition;
  }

  cancelActive() {
    if (!this.activeRecognition) return false;
    const recognition = this.activeRecognition;
    const controller = this.activeController;
    this.activeRecognition = null;
    this.activeController = null;
    controller?.abort();
    // A cancelled provider may take a moment to terminate its worker. Keep its
    // eventual rejection handled without allowing it to clear a newer job.
    void recognition.catch(() => {});
    return true;
  }

  async dispose() {
    this.cancelActive();
    await this.provider.dispose();
  }
}

module.exports = { OcrService };
