const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeOcrResult,
  normalizeOcrText
} = require("../src/services/ocr/normalize-text");
const { OcrService } = require("../src/services/ocr/ocr-service");
const {
  assertTesseractRuntimeFiles,
  PAGE_SEGMENTATION_MODES,
  TesseractOcrProvider
} = require("../src/services/ocr/providers/tesseract-provider");

test("joins visual line wraps while preserving paragraphs and scientific text", () => {
  const source = [
    "Adsorption of NH4+ on CaCO3 was measured at 25 °C.",
    "The BET surface area was 42 mg/g.",
    "",
    "XRD and FTIR confirmed CaSO4·2H2O."
  ].join("\n");

  assert.equal(
    normalizeOcrText(source),
    "Adsorption of NH4+ on CaCO3 was measured at 25 °C. The BET surface area was 42 mg/g.\n\nXRD and FTIR confirmed CaSO4·2H2O."
  );
});

test("returns an empty string for whitespace-only OCR output", () => {
  assert.equal(normalizeOcrText(" \n\t\n "), "");
});

test("keeps a line-ending hyphen while removing a visual line break", () => {
  assert.equal(
    normalizeOcrText("mechanism underpinning clay-\nmediated biodegradation"),
    "mechanism underpinning clay-mediated biodegradation"
  );
});

test("removes only high-confidence OCR soft hyphens and certain spacing errors", () => {
  assert.equal(normalizeOcrText("The reac-\ntor used Van derWaals forces."), "The reactor used Van der Waals forces.");
  assert.equal(normalizeOcrText("clay-\nmediated adsorption"), "clay-mediated adsorption");
});

test("OCR cleanup never swaps related scientific concepts", () => {
  const source = "adsorption absorption bentonite montmorillonite diatomite silica silicate ammonia ammonium";
  assert.equal(normalizeOcrText(source), source);
});

test("OCR cleanup preserves correctly recognized citations and scientific small characters", () => {
  const values = [
    "[26]",
    "[31]",
    "[22,23]",
    "[24–27]",
    "NH3",
    "NH₃",
    "CO2",
    "CO₂",
    "NH4+",
    "NH₄⁺",
    "Ca2+",
    "Ca²⁺",
    "SO4^2-",
    "SO₄²⁻",
    "ZnO-NPs",
    "ZnSO4·7H2O",
    "ZnSO₄·7H₂O",
    "NaOH 40 nm 15% p < 0.05 240 K 473–523 K 4.4 V PbS Fm-3m No.225",
    "5.9362 × 5.9536 × 5.9362 Å",
    "90° × 90° × 90°",
    "SEI NMC O-2p"
  ];

  for (const value of values) assert.equal(normalizeOcrText(value), value);
});

test("OCR cleanup does not guess an ambiguous P9 token is a citation", () => {
  assert.equal(
    normalizeOcrText("P9 Copyright 2014, American Chemical Society."),
    "P9 Copyright 2014, American Chemical Society."
  );
});

test("uses line geometry to merge visual lines and preserve real paragraphs", () => {
  const line = (text, x0, y0, x1, y1) => ({
    text,
    bbox: { x0, y0, x1, y1 }
  });
  const result = {
    text: "incorrect fallback",
    blocks: [{
      paragraphs: [{
        lines: [
          line("This reveals a clay-\n", 20, 10, 340, 30),
          line("mediated mechanism.\n", 20, 38, 360, 58),
          line("CaCO3, NH4+, BET, XRD and 42 mg/g.\n", 20, 96, 520, 116)
        ]
      }]
    }]
  };

  assert.equal(
    normalizeOcrResult(result),
    "This reveals a clay-mediated mechanism.\n\nCaCO3, NH4+, BET, XRD and 42 mg/g."
  );
});

test("prevents overlapping OCR jobs and allows a later job", async () => {
  let resolveRecognition;
  const provider = {
    recognize: () => new Promise((resolve) => { resolveRecognition = resolve; }),
    dispose: async () => {}
  };
  const service = new OcrService(provider, {
    preprocess: async (image) => image
  });
  const first = service.recognize(Buffer.from("first"));
  await new Promise(setImmediate);

  assert.throws(
    () => service.recognize(Buffer.from("second")),
    (error) => error.code === "ocr-busy"
  );

  resolveRecognition("first result");
  assert.equal(await first, "first result");

  const second = service.recognize(Buffer.from("second"));
  await new Promise(setImmediate);
  resolveRecognition("second result");
  assert.equal(await second, "second result");
});

test("cancels the active OCR provider instead of only forgetting its UI task", async () => {
  let providerCancelled = 0;
  const provider = {
    recognize: (_image, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => {
        provider.cancel();
        reject(Object.assign(new Error("cancelled"), { code: "ocr-cancelled" }));
      }, { once: true });
    }),
    cancel() { providerCancelled += 1; },
    dispose: async () => {}
  };
  const service = new OcrService(provider, { preprocess: async (image) => image });
  const recognition = service.recognize(Buffer.from("image"));
  await new Promise(setImmediate);

  assert.equal(service.cancelActive(), true);
  await assert.rejects(recognition, (error) => error.code === "ocr-cancelled");
  assert.equal(providerCancelled, 1);
  assert.equal(service.activeRecognition, null);
});

test("allows a replacement OCR job immediately after cancellation", async () => {
  const pending = [];
  const provider = {
    recognize: (_image, { signal }) => new Promise((resolve, reject) => {
      const job = { resolve, reject };
      pending.push(job);
      signal.addEventListener("abort", () => {
        setImmediate(() => reject(Object.assign(new Error("cancelled"), {
          code: "ocr-cancelled"
        })));
      }, { once: true });
    }),
    dispose: async () => {}
  };
  const service = new OcrService(provider, { preprocess: async (image) => image });
  const first = service.recognize(Buffer.from("first"));
  await new Promise(setImmediate);

  assert.equal(service.cancelActive(), true);
  const second = service.recognize(Buffer.from("second"));
  await new Promise(setImmediate);
  assert.equal(pending.length, 2);

  await assert.rejects(first, (error) => error.code === "ocr-cancelled");
  pending[1].resolve("second result");
  assert.equal(await second, "second result");
  assert.equal(service.activeRecognition, null);
});

test("a cancelled OCR promise cannot clear a newer active job", async () => {
  const pending = [];
  const provider = {
    recognize: (_image, { signal }) => new Promise((resolve, reject) => {
      pending.push({ resolve, reject, signal });
    }),
    dispose: async () => {}
  };
  const service = new OcrService(provider, { preprocess: async (image) => image });
  const first = service.recognize(Buffer.from("first"));
  await new Promise(setImmediate);
  service.cancelActive();
  const second = service.recognize(Buffer.from("second"));
  await new Promise(setImmediate);

  pending[0].reject(Object.assign(new Error("late cancellation"), { code: "ocr-cancelled" }));
  await assert.rejects(first, (error) => error.code === "ocr-cancelled");
  assert.equal(service.activeRecognition, second);

  pending[1].resolve("second result");
  assert.equal(await second, "second result");
});

test("OCR cancellation settles even if the provider does not settle its old job", async () => {
  const provider = {
    recognize: () => new Promise(() => {}),
    dispose: async () => {}
  };
  const service = new OcrService(provider, { preprocess: async (image) => image });
  const recognition = service.recognize(Buffer.from("image"));
  await new Promise(setImmediate);

  assert.equal(service.cancelActive(), true);
  await assert.rejects(recognition, (error) => error.code === "ocr-cancelled");
  assert.equal(service.activeRecognition, null);
});

test("an external task signal cancels OCR without leaving an active recognition", async () => {
  const provider = { recognize: () => new Promise(() => {}), dispose: async () => {} };
  const service = new OcrService(provider, { preprocess: async (image) => image });
  const controller = new AbortController();
  const recognition = service.recognize(Buffer.from("image"), { signal: controller.signal });
  await new Promise(setImmediate);
  controller.abort();
  await assert.rejects(recognition, (error) => error.code === "ocr-cancelled");
  assert.equal(service.activeRecognition, null);
});

test("reports a missing portable Tesseract worker before creating a worker thread", () => {
  assert.throws(
    () => assertTesseractRuntimeFiles({
      workerPath: "Z:\\missing-portable-runtime\\index.js",
      corePath: require.resolve("tesseract.js-core")
    }),
    (error) => error.code === "tesseract-runtime-missing" && /index\.js/.test(error.message)
  );
});

test("uses the configured stable Tesseract worker path", async () => {
  const calls = [];
  const worker = {
    setParameters: async () => {},
    recognize: async () => ({ data: { text: "stable", blocks: [] } }),
    terminate: async () => {}
  };
  const provider = new TesseractOcrProvider({
    modelDirectory: process.cwd(),
    runtimePaths: {
      workerPath: require.resolve("tesseract.js/src/worker-script/node/index.js"),
      corePath: require.resolve("tesseract.js-core")
    },
    workerFactory: async (_languages, _oem, options) => {
      calls.push(options);
      return worker;
    }
  });
  provider.prepareLocalModels = () => {};

  const result = await provider.recognize(Buffer.from("image"));
  assert.equal(result.text, "stable");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].workerPath, require.resolve("tesseract.js/src/worker-script/node/index.js"));
});

test("uses sparse page segmentation for full-screen multi-region OCR and restores block mode", async () => {
  const parameters = [];
  const worker = {
    setParameters: async (value) => parameters.push(value),
    recognize: async () => ({ data: { text: "menu", blocks: [] } }),
    terminate: async () => {}
  };
  const provider = new TesseractOcrProvider({
    modelDirectory: process.cwd(),
    runtimePaths: {
      workerPath: require.resolve("tesseract.js/src/worker-script/node/index.js"),
      corePath: require.resolve("tesseract.js-core")
    },
    workerFactory: async () => worker
  });
  provider.prepareLocalModels = () => {};

  await provider.recognize(Buffer.from("fullscreen"), {
    pageSegmentationMode: PAGE_SEGMENTATION_MODES.SPARSE_TEXT
  });
  await provider.recognize(Buffer.from("region"));

  assert.equal(parameters.at(-2).tessedit_pageseg_mode, "11");
  assert.equal(parameters.at(-1).tessedit_pageseg_mode, "6");
});

test("discards a failed OCR worker so the next recognition creates a replacement", async () => {
  let workersCreated = 0;
  let firstTerminated = 0;
  const provider = new TesseractOcrProvider({
    modelDirectory: process.cwd(),
    runtimePaths: {
      workerPath: require.resolve("tesseract.js/src/worker-script/node/index.js"),
      corePath: require.resolve("tesseract.js-core")
    },
    workerFactory: async () => {
      workersCreated += 1;
      const current = workersCreated;
      return {
        setParameters: async () => {},
        recognize: async () => {
          if (current === 1) throw Object.assign(new Error("worker disappeared"), { code: "ENOENT" });
          return { data: { text: "recovered", blocks: [] } };
        },
        terminate: async () => { if (current === 1) firstTerminated += 1; }
      };
    }
  });
  provider.prepareLocalModels = () => {};

  await assert.rejects(
    provider.recognize(Buffer.from("first")),
    (error) => error.code === "ocr-failed" && error.cause?.code === "ENOENT"
  );
  assert.equal(firstTerminated, 1);
  const result = await provider.recognize(Buffer.from("second"));
  assert.equal(result.text, "recovered");
  assert.equal(workersCreated, 2);
});
