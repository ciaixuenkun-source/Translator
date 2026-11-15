const {
  app,
  BrowserWindow,
  ClipboardItem,
  Menu,
  clipboard,
  desktopCapturer,
  ipcMain,
  nativeImage,
  screen
} = require("electron");
const path = require("path");
const fs = require("fs");
const {
  APP_ICON_PATH,
  APP_NAME,
  applyWindowAppDetails
} = require("../../app-assets");
const {
  captureDisplayImage,
  cropCapturedImage,
  encodeSelectionBackdrop,
  warmupScreenCapture
} = require("./screen-capture");
const { writePngImageToClipboard } = require("./image-clipboard");
const { calculatePreviewHeight } = require("./preview-window-size");
const { WindowPositionStore, visiblePosition } = require("../../windows/result/window-position-store");
const {
  RegionTranslationCoordinator
} = require("./region-translation-coordinator");
const {
  AI_PRECISE_MODE,
  FREE_MODE,
  LOCAL_MODE,
  isSupportedTranslationMode
} = require("../translator/translation-modes");
const { modeForSceneMethod } = require("../translator/scene-translation-method");
const { ContinuousRegionManager } = require("./continuous-region-manager");
const {
  extractSpatialText,
  groupSpatialTextRegions,
  mapPixelRectToScreen,
  splitTextAtBoundaries
} = require("./spatial-text");
const {
  filterSpatialRegionsForTarget,
  resolveGameText
} = require("./game-language-policy");
const { TranslationOverlayManager } = require("./translation-overlay-manager");
const {
  PAGE_SEGMENTATION_MODES
} = require("../ocr/providers/tesseract-provider");

const TRANSLATION_ERRORS = {
  "provider-not-configured": "尚未配置 AI 精译服务",
  "api-key-invalid": "API Key 无效",
  "model-unavailable": "模型不可用",
  "network-error": "网络连接失败",
  "request-timeout": "请求超时",
  "rate-limited": "请求过于频繁，请稍后重试",
  "local-model-not-configured": "本地翻译尚未配置。请设置 TRANSLATOR_LLAMA_RUNTIME_DIR 和 TRANSLATOR_QWEN_MODEL_DIR。",
  "local-runtime-unavailable": "未找到 llama-server.exe，请检查 TRANSLATOR_LLAMA_RUNTIME_DIR。",
  "local-model-unavailable": "未找到本地 Qwen 模型，请检查 TRANSLATOR_QWEN_MODEL_DIR。",
  "local-model-start-failed": "本地翻译模型启动失败",
  "local-request-failed": "本地翻译暂时失败",
  "translation-cancelled": "翻译已取消"
};

const FULLSCREEN_MAX_REGIONS = 32;
const LONG_TEXT_REGION_LENGTH = 80;
const FULLSCREEN_TRANSLATION_CHUNK_LENGTH = 900;
const FULLSCREEN_TRANSLATION_CONCURRENCY = 3;

function splitFullscreenTranslationText(value, maximumLength = FULLSCREEN_TRANSLATION_CHUNK_LENGTH) {
  return splitTextAtBoundaries(value, maximumLength);
}

function selectTranslatableFullscreenRegions(regions, targetLanguage, maxRegions = FULLSCREEN_MAX_REGIONS) {
  const eligible = filterSpatialRegionsForTarget(regions, targetLanguage);
  const limit = Math.max(0, maxRegions);
  if (eligible.length <= limit) {
    return {
      regions: eligible,
      eligibleCount: eligible.length,
      droppedByLimit: 0,
      longEligibleCount: eligible.filter((region) => region.text.length >= LONG_TEXT_REGION_LENGTH).length,
      longSelectedCount: eligible.filter((region) => region.text.length >= LONG_TEXT_REGION_LENGTH).length
    };
  }

  const indexed = eligible.map((region, index) => ({ region, index }));
  const longCandidates = indexed
    .filter(({ region }) => region.text.length >= LONG_TEXT_REGION_LENGTH)
    .sort((left, right) => right.region.text.length - left.region.text.length);
  const selectedIndexes = new Set(
    longCandidates.slice(0, Math.min(longCandidates.length, Math.ceil(limit / 4))).map(({ index }) => index)
  );
  const remaining = indexed.filter(({ index }) => !selectedIndexes.has(index));
  const remainingSlots = limit - selectedIndexes.size;
  if (remainingSlots >= remaining.length) {
    remaining.forEach(({ index }) => selectedIndexes.add(index));
  } else if (remainingSlots > 0) {
    for (let slot = 0; slot < remainingSlots; slot += 1) {
      const position = remainingSlots === 1
        ? Math.floor((remaining.length - 1) / 2)
        : Math.round(slot * (remaining.length - 1) / (remainingSlots - 1));
      selectedIndexes.add(remaining[position].index);
    }
  }
  const selected = indexed.filter(({ index }) => selectedIndexes.has(index)).map(({ region }) => region);
  return {
    regions: selected,
    eligibleCount: eligible.length,
    droppedByLimit: eligible.length - selected.length,
    longEligibleCount: longCandidates.length,
    longSelectedCount: selected.filter((region) => region.text.length >= LONG_TEXT_REGION_LENGTH).length
  };
}

async function translateFullscreenRegions(regions, {
  translateRegion,
  mapRegion,
  publish,
  onPrepared = () => {},
  onRegionState = () => {},
  isActive = () => true,
  concurrency = FULLSCREEN_TRANSLATION_CONCURRENCY
}) {
  const pendingOverlays = new Array(regions.length);
  let submitted = 0;
  let completed = 0;
  let failed = 0;
  let longSubmitted = 0;
  let longCompleted = 0;
  let nextIndex = 0;
  let activeRequests = 0;
  let peakConcurrency = 0;
  let rateLimitObserved = false;
  const failureCodes = {};

  const worker = async (workerIndex) => {
    while (isActive()) {
      if (rateLimitObserved && workerIndex > 0) return;
      const index = nextIndex;
      if (index >= regions.length) return;
      nextIndex += 1;
      const region = regions[index];
      const screenRect = mapRegion(region);
      const requestStartedAt = performance.now();
      try {
        submitted += 1;
        activeRequests += 1;
        peakConcurrency = Math.max(peakConcurrency, activeRequests);
        if (region.text.length >= LONG_TEXT_REGION_LENGTH) longSubmitted += 1;
        onRegionState(region, { stage: "submitted", screenRect });
        const result = await translateRegion(region);
        if (!isActive()) return;
        pendingOverlays[index] = { id: `fullscreen:${index}`, text: result.text, rect: screenRect, index };
        completed += 1;
        if (region.text.length >= LONG_TEXT_REGION_LENGTH) longCompleted += 1;
        onRegionState(region, {
          stage: "translated",
          screenRect,
          translatedLength: result.text.length,
          translationChunks: result.chunkCount || 1,
          requestMs: Math.round(performance.now() - requestStartedAt)
        });
      } catch (error) {
        if (error?.code === "translation-cancelled" || !isActive()) return;
        pendingOverlays[index] = { id: `fullscreen:${index}`, text: "翻译失败", rect: screenRect, tone: "error", index };
        failed += 1;
        const code = error?.code || "translation-failed";
        if (code === "rate-limited") rateLimitObserved = true;
        failureCodes[code] = (failureCodes[code] || 0) + 1;
        onRegionState(region, {
          stage: "translation-failed",
          screenRect,
          errorCode: code,
          requestMs: Math.round(performance.now() - requestStartedAt)
        });
      } finally {
        activeRequests -= 1;
      }
    }
  };
  const concurrencyLimit = Math.max(1, Math.min(Number(concurrency) || 1, regions.length || 1));
  await Promise.all(Array.from({ length: concurrencyLimit }, (_, index) => worker(index)));
  const preparedOverlays = pendingOverlays.filter(Boolean);
  const active = isActive();
  onPrepared({ completed, failed, prepared: preparedOverlays.length, failureCodes });
  let published = 0;
  if (active) {
    const results = await Promise.all(preparedOverlays.map(async ({ id, ...payload }) => {
      try {
        const displayed = (await publish(id, payload)) !== false;
        onRegionState(regions[payload.index], { stage: displayed ? "published" : "overlay-failed", overlayId: id });
        return displayed;
      } catch {
        onRegionState(regions[payload.index], { stage: "overlay-failed", overlayId: id });
        return false;
      }
    }));
    published = results.filter(Boolean).length;
  }
  return {
    submitted, completed, failed, longSubmitted, longCompleted,
    prepared: preparedOverlays.length, published, failureCodes,
    cancelled: !active,
    concurrencyLimit,
    peakConcurrency,
    rateLimitObserved
  };
}

class RegionCaptureController {
  constructor({
    ocrService,
    translatorService,
    onHideBall,
    onRestoreBall,
    onNotice,
    getGamePreferences = () => ({ sourceLanguage: "zh-CN", targetLanguage: "en", durationSeconds: 5 }),
    getOverlayStyle = () => ({}),
    getOverlaySettings = () => ({ regionRefreshIntervalMs: 1600, regionOverlayDurationMs: 1200 })
  }) {
    this.ocrService = ocrService;
    this.translations = new RegionTranslationCoordinator(translatorService);
    this.onHideBall = onHideBall;
    this.onRestoreBall = onRestoreBall;
    this.onNotice = onNotice;
    this.getGamePreferences = getGamePreferences;
    this.getOverlaySettings = getOverlaySettings;
    this.overlays = new TranslationOverlayManager({ getStyle: getOverlayStyle });
    this.continuous = new ContinuousRegionManager({
      inspectRegion: (region) => this.inspectContinuousRegion(region),
      onUpdate: (region, result) => this.showContinuousResult(region, result),
      onError: (region) => this.overlays.set(`region:${region.id}`, { text: "识别或翻译暂时失败", rect: region.screenRect, tone: "error", durationMs: this.getOverlaySettings().regionOverlayDurationMs, kind: "region" }),
      getIntervalMs: () => this.getOverlaySettings().regionRefreshIntervalMs
    });
    this.session = null;
    this.previewWindow = null;
    this.previewData = null;
    this.previewImageBuffer = null;
    this.previewDisplay = null;
    this.overlayWindow = null;
    this.overlayLoadPromise = null;
    this.overlayCaptureReady = null;
    this.overlayInteractiveReady = null;
    this.ocrTask = null;
    this.nextOcrTaskId = 0;
    this.nextPreviewSessionId = 0;
    this.fullscreenOverlayTimer = null;
    this.previewPositionStore = new WindowPositionStore(
      path.join(app.getPath("userData"), "region-result-position.json")
    );
    this.registerIpc();
    this.ensureOverlayWindow().catch((error) => {
      console.error("[region-capture] overlay preload failed", error?.message);
    });
    warmupScreenCapture(desktopCapturer).catch((error) => {
      console.error("[region-capture] screen capture warmup failed", error?.message);
    });
  }

  isActive() {
    return Boolean(this.session || this.ocrTask);
  }

  captureDisplay(display) {
    return captureDisplayImage(display, desktopCapturer, {
      nativeImage,
      displays: screen.getAllDisplays(),
      onNativeFallback: (reason) => console.warn("[region-capture] native fallback", { reason })
    });
  }

  isCapturing() {
    return Boolean(this.session);
  }

  isOverlaySender(sender) {
    return Boolean(
      this.session?.overlay &&
      !this.session.overlay.isDestroyed() &&
      sender.id === this.session.overlay.webContents.id
    );
  }

  isPreviewSender(sender) {
    return Boolean(
      this.previewWindow &&
      !this.previewWindow.isDestroyed() &&
      sender.id === this.previewWindow.webContents.id
    );
  }

  registerIpc() {
    ipcMain.on("region-capture-ready", (event, ready) => {
      if (!this.isOverlaySender(event.sender)) return;
      this.overlayCaptureReady?.(ready !== false);
    });

    ipcMain.on("region-capture-interactive", (event) => {
      if (!this.isOverlaySender(event.sender)) return;
      this.overlayInteractiveReady?.();
    });

    ipcMain.on("region-capture-confirm", (event, payload) => {
      if (!this.isOverlaySender(event.sender)) return;
      this.confirm(payload);
    });

    ipcMain.on("region-capture-cancel", (event, reason) => {
      if (!this.isOverlaySender(event.sender)) return;
      this.cancel(reason || "cancel");
    });

    ipcMain.handle("region-preview-bootstrap", (event) => {
      if (!this.isPreviewSender(event.sender)) return null;
      return this.previewData;
    });

    ipcMain.on("region-preview-close", (event) => {
      if (this.isPreviewSender(event.sender)) this.previewWindow.close();
    });

    ipcMain.on("region-preview-reselect", (event) => {
      if (!this.isPreviewSender(event.sender) || this.ocrTask) return;
      const options = {
        translationMethod: this.previewData?.translationMethod,
        direction: {
          sourceLanguage: this.previewData?.sourceLanguage,
          targetLanguage: this.previewData?.targetLanguage
        }
      };
      this.closePreview();
      this.start(options);
    });

    ipcMain.handle("region-preview-translate", async (event, payload) => {
      if (!this.isPreviewSender(event.sender)) {
        return { ok: false, message: "当前窗口无法发起翻译" };
      }
      const mode = payload?.mode;
      const text = typeof payload?.text === "string" ? payload.text.trim() : "";
      if (!isSupportedTranslationMode(mode) || !text) {
        return { ok: false, message: text ? "翻译模式无效" : "没有可翻译的原文" };
      }
      return this.translatePreview({
        sessionId: this.previewData?.sessionId,
        text,
        mode
      });
    });

    ipcMain.on("region-preview-resize", (event, content) => {
      if (this.isPreviewSender(event.sender)) this.resizePreview(content);
    });

    ipcMain.on("region-preview-cancel-translation", (event) => {
      if (!this.isPreviewSender(event.sender)) return;
      this.translations.cancel();
      this.updatePreview({
        state: "editing",
        message: "原文已修改",
        translatedText: "",
        warnings: []
      });
    });
  }

  prepareOverlayScreenshot() {
    const session = this.session;
    if (!session || session.screenshot) return;

    const captureBounds = session.overlay.getContentBounds();
    const relativeBounds = {
      x: captureBounds.x - session.display.bounds.x,
      y: captureBounds.y - session.display.bounds.y,
      width: captureBounds.width,
      height: captureBounds.height
    };
    const capture = cropCapturedImage(
      session.fullScreenshot,
      relativeBounds,
      { width: session.display.bounds.width, height: session.display.bounds.height }
    );
    session.captureBounds = captureBounds;
    session.capturePixelRect = capture.pixelRect;
    session.screenshot = capture.image;
    session.screenshotSize = capture.image.getSize();

    console.info("[region-capture] overlay", JSON.stringify({
      captureBounds,
      capturePixelRect: capture.pixelRect,
      screenshotSize: session.screenshotSize
    }));
  }

  async start(options = {}) {
    if (this.session || this.ocrTask) return false;
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const startedAt = Date.now();
    const triggeredAt = Number.isFinite(options.triggeredAt) ? options.triggeredAt : startedAt;
    const timing = { triggeredAt, controllerStartedAt: startedAt };
    this.session = { display, phase: "capturing", overlay: null, options };
    this.closePreview();

    try {
      const overlayPromise = this.ensureOverlayWindow();
      timing.hideStartedAt = Date.now();
      await this.onHideBall();
      timing.ballHiddenAt = Date.now();
      if (!this.session) return false;
      timing.captureStartedAt = Date.now();
      const [overlay, capture] = await Promise.all([
        overlayPromise,
        this.captureDisplay(display)
      ]);
      timing.captureReadyAt = Date.now();
      if (!this.session) return false;
      Object.assign(this.session, {
        overlay,
        fullScreenshot: capture.image,
        fullScreenshotSize: capture.imageSize,
        requestedSize: capture.requestedSize,
        sourceId: capture.sourceId,
        captureBackend: capture.captureBackend
      });

      console.info("[region-capture] display", JSON.stringify({
        bounds: display.bounds,
        workArea: display.workArea,
        scaleFactor: display.scaleFactor,
        requestedSize: capture.requestedSize,
        fullScreenshotSize: capture.imageSize,
        sourceId: capture.sourceId,
        captureBackend: capture.captureBackend
      }));
      const overlayTiming = await this.showOverlay();
      const readyAt = overlayTiming.interactiveAt;
      console.info("[region-capture] timing", {
        shortcutDispatchMs: timing.controllerStartedAt - timing.triggeredAt,
        hideBallMs: timing.ballHiddenAt - timing.hideStartedAt,
        desktopCaptureMs: timing.captureReadyAt - timing.captureStartedAt,
        screenshotEncodeMs: overlayTiming.screenshotEncodedAt - overlayTiming.startedAt,
        overlayImageLoadMs: overlayTiming.imageReadyAt - overlayTiming.screenshotEncodedAt,
        overlayPaintMs: overlayTiming.interactiveAt - overlayTiming.imageReadyAt,
        totalMs: readyAt - timing.triggeredAt,
        firstUse: overlayTiming.firstUse,
        backdropBytes: overlayTiming.backdropBytes,
        backdropMimeType: overlayTiming.backdropMimeType,
        captureBackend: capture.captureBackend
      });
      return true;
    } catch (error) {
      console.error("[region-capture] start failed", error?.message);
      this.finishSession();
      this.onNotice("区域截图启动失败");
      return false;
    }
  }

  async captureFullScreen(options = {}) {
    if (this.session || this.ocrTask) return false;
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    this.closePreview();
    this.session = { display, phase: "capturing-fullscreen", overlay: null, options };
    const timing = { totalStartedAt: performance.now() };
    try {
      await this.onHideBall();
      if (!this.session) return false;
      timing.captureStartedAt = performance.now();
      const capture = await this.captureDisplay(display);
      timing.captureFinishedAt = performance.now();
      if (!this.session) return false;
      this.finishSession();
      return await this.processFullScreenCapture(capture, display, options, timing);
    } catch (error) {
      console.error("[region-capture] fullscreen capture failed", error?.message);
      timing.displayFinishedAt = performance.now();
      this.logFullscreenDiagnostics(timing, {
        status: "failed",
        failureStage: "capture",
        failureCodes: { [error?.code || "capture-failed"]: 1 }
      });
      this.finishSession();
      this.onNotice("全屏识别翻译启动失败");
      return false;
    }
  }

  async translateGameText(text, signal, kind = "fullscreen") {
    const preferences = this.getGamePreferences(kind) || {};
    const chunks = kind === "fullscreen" ? splitFullscreenTranslationText(text) : [text];
    const results = [];
    for (const chunk of chunks) {
      results.push(await this.translations.translatorService.translate(chunk, {
        mode: modeForSceneMethod(preferences.translationMethod),
        sourceLanguage: preferences.sourceLanguage,
        targetLanguage: preferences.targetLanguage || "zh-CN",
        signal,
        includeDetails: true
      }));
    }
    const last = results.at(-1) || {};
    return {
      ...last,
      text: results.map((result) => result.text).join("\n"),
      warnings: results.flatMap((result) => Array.isArray(result.warnings) ? result.warnings : []),
      chunkCount: chunks.length
    };
  }

  async processFullScreenCapture(capture, display, _options = {}, timing = {}) {
    clearTimeout(this.fullscreenOverlayTimer);
    this.fullscreenOverlayTimer = null;
    this.overlays.clear("fullscreen:");
    const task = { id: ++this.nextOcrTaskId, controller: new AbortController(), cancelReason: "" };
    this.ocrTask = task;
    timing.totalStartedAt ||= performance.now();
    try {
      timing.ocrStartedAt = performance.now();
      const layout = await this.ocrService.recognizeLayout(capture.image.toPNG(), {
        signal: task.controller.signal,
        pageSegmentationMode: PAGE_SEGMENTATION_MODES.SPARSE_TEXT
      });
      timing.ocrFinishedAt = performance.now();
      if (this.ocrTask !== task) return { cancelled: true };
      timing.filterStartedAt = performance.now();
      // Collect the complete OCR layout first. Applying the display cap here used to let
      // already-target-language text consume all slots and silently drop later source text.
      const extractionStats = {};
      const extractedRegions = extractSpatialText(layout.blocks, {
        maxRegions: Number.POSITIVE_INFINITY,
        diagnostics: extractionStats
      });
      if (!extractedRegions.length && layout.text) {
        extractedRegions.push({ text: layout.text, rect: { x: 0, y: 0, width: capture.imageSize.width, height: capture.imageSize.height }, sourceLevel: "fallback" });
      }
      const groupingStats = {};
      const regions = groupSpatialTextRegions(extractedRegions, { diagnostics: groupingStats });
      const regionLevels = regions.reduce((summary, region) => {
        const level = region.sourceLevel || "unknown";
        summary[level] = (summary[level] || 0) + 1;
        return summary;
      }, {});
      const preferences = this.getGamePreferences("fullscreen") || {};
      const fullscreenTranslationMode = modeForSceneMethod(preferences.translationMethod);
      const diagnosticRegions = regions.map((region, diagnosticId) => ({ ...region, diagnosticId }));
      const selection = selectTranslatableFullscreenRegions(diagnosticRegions, preferences.targetLanguage);
      const translatableRegions = selection.regions;
      const selectedIds = new Set(translatableRegions.map((region) => region.diagnosticId));
      const regionDiagnostics = diagnosticRegions.map((region) => ({
        id: region.diagnosticId,
        chars: region.text.length,
        sourceLevel: region.sourceLevel || "unknown",
        memberCount: region.memberCount || 1,
        sourceRect: region.rect,
        selected: selectedIds.has(region.diagnosticId),
        long: region.text.length >= LONG_TEXT_REGION_LENGTH,
        stage: selectedIds.has(region.diagnosticId) ? "selected" : "not-selected"
      }));
      const diagnosticById = new Map(regionDiagnostics.map((region) => [region.id, region]));
      timing.filterFinishedAt = performance.now();
      if (!translatableRegions.length) {
        this.onNotice("全屏未识别到需要翻译的文字");
        this.logFullscreenDiagnostics(timing, {
          status: "skipped",
          failureStage: "filter",
          ocrBlocks: layout.blocks.length,
          extractedRegions: extractedRegions.length,
          groupedRegions: regions.length,
          eligibleRegions: selection.eligibleCount,
          droppedByLimit: selection.droppedByLimit,
          longEligibleRegions: selection.longEligibleCount,
          longSelectedRegions: selection.longSelectedCount,
          extractionStats,
          groupingStats,
          translatableRegions: 0,
          completed: 0,
          failed: 0,
          published: 0,
          regionLevels,
          regions: regionDiagnostics,
          captureImageSize: capture.imageSize,
          displayBounds: display.bounds,
          captureBackend: capture.captureBackend || "unknown"
        });
        return { ok: false, reason: "no-translatable-text" };
      }
      timing.translationStartedAt = performance.now();
      const translation = await translateFullscreenRegions(translatableRegions, {
        translateRegion: (region) => this.translateGameText(region.text, task.controller.signal, "fullscreen"),
        mapRegion: (region) => mapPixelRectToScreen(region.rect, capture.imageSize, display.bounds),
        publish: async (id, payload) => {
          const displayed = await this.overlays.set(id, payload);
          const overlay = this.overlays.describe(id);
          const region = translatableRegions[payload.index];
          Object.assign(diagnosticById.get(region?.diagnosticId) || {}, { overlay });
          return displayed;
        },
        onPrepared: () => { timing.translationFinishedAt = performance.now(); },
        onRegionState: (region, state) => {
          const target = diagnosticById.get(region?.diagnosticId);
          if (target) Object.assign(target, state);
        },
        isActive: () => this.ocrTask === task && !task.controller.signal.aborted,
        concurrency: fullscreenTranslationMode === LOCAL_MODE ? 1 : FULLSCREEN_TRANSLATION_CONCURRENCY
      });
      timing.displayFinishedAt = performance.now();
      const duration = Number(this.getGamePreferences("fullscreen")?.durationSeconds || 5) * 1000;
      this.fullscreenOverlayTimer = setTimeout(() => {
        this.fullscreenOverlayTimer = null;
        this.overlays.clear("fullscreen:");
      }, Math.max(500, duration));
      if (translation.cancelled) {
        this.onNotice("全屏翻译已取消");
      } else if (!translation.completed) this.onNotice("全屏文字翻译失败");
      else if (translation.failed || translation.published < translation.prepared) {
        this.onNotice(`全屏翻译完成 ${translation.completed} 处，失败 ${translation.failed + translation.prepared - translation.published} 处`);
      }
      this.logFullscreenDiagnostics(timing, {
        status: translation.cancelled
          ? "cancelled"
          : translation.completed > 0 && !translation.failed && translation.published === translation.prepared ? "success" : "partial",
        failureStage: translation.cancelled
          ? "cancelled"
          : translation.failed || !translation.completed
          ? "translation"
          : translation.published < translation.prepared ? "overlay" : "",
        cancellationReason: task.cancelReason,
        ocrBlocks: layout.blocks.length,
        extractedRegions: extractedRegions.length,
        groupedRegions: regions.length,
        translatableRegions: translatableRegions.length,
        eligibleRegions: selection.eligibleCount,
        droppedByLimit: selection.droppedByLimit,
        longEligibleRegions: selection.longEligibleCount,
        longSelectedRegions: selection.longSelectedCount,
        extractionStats,
        groupingStats,
        regionLevels,
        regions: regionDiagnostics,
        captureImageSize: capture.imageSize,
        displayBounds: display.bounds,
        captureBackend: capture.captureBackend || "unknown",
        ...translation
      });
      return {
        ok: translation.completed > 0,
        regions: translatableRegions.length,
        completed: translation.completed,
        failed: translation.failed,
        displayed: translation.published
      };
    } catch (error) {
      if (this.ocrTask === task && error?.code !== "ocr-cancelled") this.onNotice("全屏文字识别失败");
      timing.displayFinishedAt = performance.now();
      this.logFullscreenDiagnostics(timing, {
        status: error?.code === "ocr-cancelled" ? "cancelled" : "failed",
        failureStage: "ocr",
        failureCodes: { [error?.code || "ocr-failed"]: 1 }
      });
      return { ok: false, reason: error?.code || "ocr-failed" };
    } finally {
      if (this.ocrTask === task) this.ocrTask = null;
    }
  }

  logFullscreenDiagnostics(timing, counts) {
    const end = timing.displayFinishedAt || performance.now();
    const diagnostics = {
      recordedAt: new Date().toISOString(),
      status: counts.status || "unknown",
      failureStage: counts.failureStage || "",
      captureMs: Math.round((timing.captureFinishedAt || timing.totalStartedAt) - (timing.captureStartedAt || timing.totalStartedAt)),
      ocrMs: Math.round((timing.ocrFinishedAt || end) - (timing.ocrStartedAt || end)),
      filterMs: Math.round((timing.filterFinishedAt || end) - (timing.filterStartedAt || end)),
      translationMs: Math.round((timing.translationFinishedAt || end) - (timing.translationStartedAt || end)),
      overlayDisplayMs: Math.round((timing.displayFinishedAt || end) - (timing.translationFinishedAt || end)),
      totalMs: Math.round(end - timing.totalStartedAt),
      ocrBlocks: Number(counts.ocrBlocks || 0),
      extractedRegions: Number(counts.extractedRegions || 0),
      groupedRegions: Number(counts.groupedRegions || counts.extractedRegions || 0),
      groupedSourceRegions: Number(counts.groupingStats?.groupedSourceRegions || 0),
      eligibleRegions: Number(counts.eligibleRegions || 0),
      droppedByLimit: Number(counts.droppedByLimit || 0),
      longEligibleRegions: Number(counts.longEligibleRegions || 0),
      longSelectedRegions: Number(counts.longSelectedRegions || 0),
      lengthFiltered: Number(counts.extractionStats?.lengthFiltered || 0),
      invalidBoundsFiltered: Number(counts.extractionStats?.invalidBoundsFiltered || 0),
      confidenceFiltered: Number(counts.extractionStats?.confidenceFiltered || 0),
      duplicateFiltered: Number(counts.extractionStats?.duplicateFiltered || 0),
      translationSubmitted: Number(counts.submitted || 0),
      translatableRegions: Number(counts.translatableRegions || 0),
      translated: Number(counts.completed || 0),
      longTranslationSubmitted: Number(counts.longSubmitted || 0),
      longTranslationCompleted: Number(counts.longCompleted || 0),
      translationFailed: Number(counts.failed || 0),
      translationAbandoned: Math.max(0, Number(counts.submitted || 0) - Number(counts.completed || 0) - Number(counts.failed || 0)),
      translationNotSubmitted: Math.max(0, Number(counts.translatableRegions || 0) - Number(counts.submitted || 0)),
      displayed: Number(counts.published || 0),
      overlayFailed: counts.cancelled ? 0 : Math.max(0, Number(counts.prepared || 0) - Number(counts.published || 0)),
      regionLevels: counts.regionLevels || {},
      failureCodes: counts.failureCodes || {},
      translationConcurrencyLimit: Number(counts.concurrencyLimit || 0),
      translationPeakConcurrency: Number(counts.peakConcurrency || 0),
      rateLimitObserved: Boolean(counts.rateLimitObserved),
      cancellationReason: counts.cancellationReason || "",
      captureImageSize: counts.captureImageSize || null,
      displayBounds: counts.displayBounds || null,
      captureBackend: counts.captureBackend || "unknown",
      regions: Array.isArray(counts.regions) ? counts.regions : []
    };
    const serialized = JSON.stringify(diagnostics);
    console.info("[game-fullscreen] diagnostics", serialized);
    try {
      fs.appendFileSync(path.join(app.getPath("userData"), "game-fullscreen-diagnostics.jsonl"), `${serialized}\n`, "utf8");
    } catch (error) {
      console.warn("[game-fullscreen] diagnostics file unavailable", { code: error?.code || "write-failed" });
    }
  }

  addContinuousRegion(region) {
    return this.continuous.add(region);
  }

  async inspectContinuousRegion(region, { signal } = {}) {
    const display = screen.getAllDisplays().find((item) => String(item.id) === String(region.displayId));
    if (!display) { const error = new Error("显示器已断开"); error.code = "display-missing"; throw error; }
    this.overlays.hideAll();
    try {
      const capture = await this.captureDisplay(display);
      if (signal?.aborted) { const error = new Error("持续区域翻译已取消"); error.code = "ocr-cancelled"; throw error; }
      const relative = {
        x: region.screenRect.x - display.bounds.x,
        y: region.screenRect.y - display.bounds.y,
        width: region.screenRect.width,
        height: region.screenRect.height
      };
      const cropped = cropCapturedImage(capture.image, relative, { width: display.bounds.width, height: display.bounds.height });
      const sourceText = await this.ocrService.recognize(cropped.image.toPNG(), { signal });
      if (!sourceText) return { sourceText: "", translatedText: "" };
      const preferences = this.getGamePreferences("region") || {};
      return await resolveGameText({
        sourceText,
        targetLanguage: preferences.targetLanguage,
        lastKey: region.lastKey,
        lastResult: region.lastResult,
        translate: async (text) => (await this.translateGameText(text, signal, "region")).text
      });
    } finally {
      this.overlays.showAll();
    }
  }

  showContinuousResult(region, result) {
    if (result?.clearOverlay) {
      this.overlays.remove(`region:${region.id}`);
      return;
    }
    if (!result?.translatedText) return;
    this.overlays.set(`region:${region.id}`, {
      text: result.translatedText,
      rect: region.screenRect,
      durationMs: this.getOverlaySettings().regionOverlayDurationMs,
      kind: "region"
    });
  }

  pauseContinuousRegions() { this.continuous.pause(); }
  resumeContinuousRegions() { this.continuous.resume(); }
  clearContinuousRegions() { this.continuous.clear(); this.overlays.clear("region:"); }

  ensureOverlayWindow() {
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      return this.overlayLoadPromise;
    }
    const overlay = new BrowserWindow({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      useContentSize: true,
      show: false,
      frame: false,
      thickFrame: false,
      hasShadow: false,
      transparent: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      focusable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      backgroundColor: "#000000",
      webPreferences: {
        preload: path.join(__dirname, "overlay", "preload.js"),
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    this.overlayWindow = overlay;
    overlay.setAlwaysOnTop(true, "screen-saver");
    this.overlayLoadPromise = new Promise((resolve, reject) => {
      overlay.webContents.once("did-finish-load", () => resolve(overlay));
      overlay.webContents.once("did-fail-load", (_event, code, description) => {
        reject(new Error(`截图选择窗口加载失败 (${code}): ${description}`));
      });
    });
    overlay.loadFile(path.join(__dirname, "overlay", "index.html"));
    overlay.on("closed", () => {
      if (this.overlayWindow === overlay) {
        this.overlayWindow = null;
        this.overlayLoadPromise = null;
      }
      if (this.session?.overlay === overlay) this.finishSession();
    });
    return this.overlayLoadPromise;
  }

  async showOverlay() {
    const session = this.session;
    if (!session?.overlay || session.overlay.isDestroyed()) return;
    const overlay = session.overlay;
    overlay.setBounds(session.display.bounds, false);
    this.prepareOverlayScreenshot();
    session.phase = "selecting";
    const startedAt = Date.now();
    const backdrop = encodeSelectionBackdrop(session.screenshot);
    const screenshotEncodedAt = Date.now();

    const imageReady = await new Promise((resolve) => {
      this.overlayCaptureReady = resolve;
      overlay.webContents.send("region-capture-start", {
        imageBuffer: backdrop.buffer,
        mimeType: backdrop.mimeType
      });
    });
    const imageReadyAt = Date.now();
    this.overlayCaptureReady = null;
    if (!imageReady) throw new Error("截图选择窗口无法显示屏幕图像");
    if (!this.session || this.session.overlay !== overlay) return;
    const firstUse = !overlay.__regionCaptureShown;
    const interactive = new Promise((resolve) => {
      this.overlayInteractiveReady = resolve;
    });
    overlay.showInactive();
    overlay.webContents.send("region-capture-shown");
    await interactive;
    const interactiveAt = Date.now();
    this.overlayInteractiveReady = null;
    overlay.__regionCaptureShown = true;
    return {
      startedAt,
      screenshotEncodedAt,
      imageReadyAt,
      interactiveAt,
      firstUse,
      backdropBytes: backdrop.buffer.length,
      backdropMimeType: backdrop.mimeType
    };
  }

  async copyImageBuffer(imageBuffer, { automatic = false } = {}) {
    try {
      await writePngImageToClipboard(imageBuffer, {
        clipboard,
        ClipboardItem,
        nativeImage
      });
      return { ok: true, message: "截图图片已复制" };
    } catch (error) {
      console.error(
        automatic
          ? "[region-capture] automatic image copy failed"
          : "[region-capture] copy image failed",
        error?.message
      );
      return { ok: false, message: "复制图片失败" };
    }
  }

  async confirm(payload) {
    if (!this.session?.screenshot || this.session.phase !== "selecting") return;
    this.session.phase = "finishing";

    try {
      const croppedCapture = cropCapturedImage(
        this.session.screenshot,
        payload?.rect,
        payload?.viewport
      );
      const pixelRect = croppedCapture.pixelRect;
      if (pixelRect.width < 1 || pixelRect.height < 1) {
        throw new Error("选区尺寸无效");
      }
      const cropped = croppedCapture.image;
      const croppedSize = cropped.getSize();
      const sessionOptions = this.session.options || {};
      const displayBounds = this.session.display.bounds;
      console.info("[region-capture] selection", JSON.stringify({
        displayBounds: this.session.display.bounds,
        captureBounds: this.session.captureBounds,
        scaleFactor: this.session.display.scaleFactor,
        devicePixelRatio: payload.viewport.devicePixelRatio,
        cssRect: payload.rect,
        viewport: payload.viewport,
        screenshotSize: this.session.screenshotSize,
        pixelRect,
        croppedSize
      }));

      const imageBuffer = cropped.toPNG();
      const previewData = {
        sessionId: ++this.nextPreviewSessionId,
        state: "recognizing",
        message: "正在识别文字…",
        imageDataUrl: `data:image/png;base64,${imageBuffer.toString("base64")}`,
        width: croppedSize.width,
        height: croppedSize.height,
        sourceText: "",
        translatedText: "",
        translationMode: modeForSceneMethod(sessionOptions.translationMethod),
        sourceLanguage: sessionOptions.direction?.sourceLanguage,
        targetLanguage: sessionOptions.direction?.targetLanguage,
        warnings: []
      };
      const display = this.session.display;
      sessionOptions.onSelectionComplete?.({
        displayId: String(this.session.display.id),
        screenRect: {
          x: displayBounds.x + Number(payload?.rect?.x || 0),
          y: displayBounds.y + Number(payload?.rect?.y || 0),
          width: Number(payload?.rect?.width || 0),
          height: Number(payload?.rect?.height || 0)
        },
        pixelRect
      });
      this.finishSession();
      if (sessionOptions.selectionOnly) return;
      this.openPreview(previewData, display, imageBuffer);
      const task = { id: ++this.nextOcrTaskId };
      this.ocrTask = task;
      if (sessionOptions.copyImage !== false) void this.copyImageBuffer(Buffer.from(imageBuffer), { automatic: true })
        .then((result) => {
          this.updatePreview({
            copyNotice: result.ok ? "截图已复制" : "截图复制失败",
            copyNoticeTone: result.ok ? "success" : "error"
          });
        });

      try {
        const text = await this.ocrService.recognize(imageBuffer, {
          onProgress: (progress) => this.handleOcrProgress(task, progress)
        });
        if (this.ocrTask !== task) return;
        if (text) {
          this.ocrTask = null;
          sessionOptions.onTaskStatus?.("recognized");
          this.updatePreview({
            state: "recognized",
            message: "文字识别完成",
            sourceText: text,
            translatedText: "",
            warnings: []
          });
          void this.translatePreview({
            sessionId: previewData.sessionId,
            text,
            mode: previewData.translationMode
          });
        } else {
          sessionOptions.onTaskStatus?.("empty");
          this.updatePreview({
            state: "empty",
            message: "未识别到文字",
            sourceText: "",
            translatedText: ""
          });
        }
      } catch (error) {
        if (this.ocrTask !== task) return;
        sessionOptions.onTaskStatus?.("error");
        console.error("[ocr] recognition failed", {
          code: error?.code || "ocr-failed",
          causeCode: error?.cause?.code || "unknown",
          message: error?.message
        });
          this.updatePreview({
            state: "error",
          message: error?.code === "ocr-initialization-failed"
            ? "本地 OCR 启动失败，请重试截图"
            : "文字识别失败，请重试截图",
            sourceText: "",
            translatedText: ""
          });
      } finally {
        if (this.ocrTask === task) this.ocrTask = null;
      }
    } catch (error) {
      console.error("[region-capture] crop failed", error?.message);
      this.finishSession();
      this.onNotice("区域截图失败");
    }
  }

  handleOcrProgress(task, progress) {
    if (this.ocrTask !== task || !progress) return;
    if (progress.status === "recognizing text") {
      const percent = Math.max(1, Math.min(99, Math.round(progress.progress * 100)));
      this.updatePreview({ message: `正在识别文字… ${percent}%` });
    } else if (progress.status?.startsWith("loading")) {
      this.updatePreview({ message: "正在加载本地 OCR…" });
    }
  }

  updatePreview(changes) {
    if (!this.previewData) return;
    Object.assign(this.previewData, changes);
    if (this.previewWindow && !this.previewWindow.isDestroyed()) {
      this.previewWindow.webContents.send("region-preview-update", changes);
    }
  }

  isCurrentPreviewSession(sessionId) {
    return Boolean(
      sessionId &&
      this.previewData?.sessionId === sessionId &&
      this.previewWindow &&
      !this.previewWindow.isDestroyed()
    );
  }

  async translatePreview({ sessionId, text, mode }) {
    if (!this.isCurrentPreviewSession(sessionId)) {
      return { ok: false, stale: true };
    }
    let streamedText = "";
    const providerLabel = this.translations.providerLabel(mode);
    this.updatePreview({
      state: "translating",
      message: mode === FREE_MODE
        ? "正在启动本地模型…"
        : `正在翻译 · ${providerLabel}`,
      sourceText: text,
      translatedText: "",
      translationMode: mode,
      warnings: []
    });

    const outcome = await this.translations.translate({
      sessionId,
      text,
      mode,
      sourceLanguage: this.previewData?.sourceLanguage,
      targetLanguage: this.previewData?.targetLanguage,
      onStatus: (status) => {
        if (!this.isCurrentPreviewSession(sessionId)) return;
        if (status?.stage === "starting") {
          this.updatePreview({ message: "正在启动本地翻译模型…" });
        } else if (status?.stage === "translating") {
          this.updatePreview({ message: `正在翻译 · ${providerLabel}` });
        }
      },
      onChunk: (chunk) => {
        if (!this.isCurrentPreviewSession(sessionId)) return;
        streamedText += chunk;
        this.updatePreview({ translatedText: streamedText });
      },
      onStreamReset: () => {
        streamedText = "";
        if (this.isCurrentPreviewSession(sessionId)) {
          this.updatePreview({
            message: "正在重新连接…",
            translatedText: ""
          });
        }
      }
    });

    if (!this.isCurrentPreviewSession(sessionId) || outcome.stale) {
      return { ok: false, stale: true };
    }
    if (outcome.ok) {
      const warnings = outcome.result.warnings || [];
      this.updatePreview({
        state: "success",
        message: `翻译完成 · ${outcome.result.providerLabel || (mode === FREE_MODE ? "Qwen3-4B" : "AI 精译")}`,
        translatedText: outcome.result.text,
        translationMode: mode,
        warnings,
        localTranslation: outcome.result.provider === "qwen-local"
      });
      return { ok: true, warnings };
    }

    const code = outcome.error?.code || "translation-failed";
    const message = TRANSLATION_ERRORS[code] || "翻译暂时失败";
    if (code !== "translation-cancelled") {
      console.error("[region-translation] failed", code, outcome.error?.message);
    }
    this.updatePreview({
      state: "translation-error",
      message,
      translatedText: "",
      warnings: []
    });
    return { ok: false, code, message };
  }

  cancel(reason = "cancel") {
    if (!this.session) return;
    console.info("[region-capture] cancelled", { reason });
    this.finishSession();
  }

  finishSession() {
    const overlay = this.session?.overlay;
    const onFinished = this.session?.options?.onFinished;
    this.session = null;
    this.overlayCaptureReady?.(false);
    this.overlayCaptureReady = null;
    this.overlayInteractiveReady?.();
    this.overlayInteractiveReady = null;
    if (overlay && !overlay.isDestroyed()) overlay.hide();
    this.onRestoreBall();
    onFinished?.();
  }

  cancelRecognition(reason = "cancel") {
    this.cancelOcrTask(reason);
    this.translations.cancel();
    if (this.session) this.cancel(reason);
    this.closePreview({ cancelRecognition: false });
    clearTimeout(this.fullscreenOverlayTimer);
    this.fullscreenOverlayTimer = null;
    this.overlays.clear("fullscreen:");
  }

  cancelOcrTask(reason = "cancel") {
    if (!this.ocrTask) return false;
    console.info("[region-capture] OCR cancelled", { reason, taskId: this.ocrTask.id });
    this.ocrTask.cancelReason = String(reason || "cancel");
    this.ocrTask.controller?.abort();
    this.ocrTask = null;
    this.ocrService.cancelActive?.();
    return true;
  }

  openPreview(previewData, display, previewImageBuffer) {
    this.closePreview();
    this.previewData = previewData;
    this.previewImageBuffer = Buffer.from(previewImageBuffer);
    this.previewDisplay = display;
    const width = Math.min(780, Math.round(display.workArea.width * 0.82));
    const height = calculatePreviewHeight({
      ...previewData,
      workAreaHeight: display.workArea.height
    });
    const fallbackPosition = {
      x: display.workArea.x + Math.round((display.workArea.width - width) / 2),
      y: display.workArea.y + Math.round((display.workArea.height - height) / 2)
    };
    const position = visiblePosition(
      this.previewPositionStore.load(),
      screen.getAllDisplays(),
      { width, height },
      fallbackPosition
    );

    const preview = new BrowserWindow({
      x: position.x,
      y: position.y,
      width,
      height,
      minWidth: 480,
      minHeight: 270,
      show: false,
      frame: false,
      resizable: true,
      fullscreenable: false,
      backgroundColor: "#fff8ea",
      title: APP_NAME,
      icon: APP_ICON_PATH,
      webPreferences: {
        preload: path.join(__dirname, "preview", "preload.js"),
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    applyWindowAppDetails(preview);
    this.previewWindow = preview;
    let userMoved = false;
    let allowMoveTracking = false;
    let shown = false;
    const showPreview = () => {
      if (shown || preview.isDestroyed()) return;
      shown = true;
      preview.show();
      preview.focus();
      setTimeout(() => { allowMoveTracking = true; }, 250);
    };
    preview.once("ready-to-show", showPreview);
    preview.webContents.once("did-finish-load", showPreview);
    preview.loadFile(path.join(__dirname, "preview", "index.html"))
      .then(showPreview)
      .catch((error) => {
        console.error("[region-capture] preview load failed", error?.message);
      });
    preview.webContents.on("context-menu", (_event, params) => {
      const template = [];
      if (params.isEditable && params.selectionText) {
        template.push({ label: "剪切", role: "cut" });
      }
      if (params.selectionText) template.push({ label: "复制", role: "copy" });
      if (params.isEditable) template.push({ label: "粘贴", role: "paste" });
      if (template.length) Menu.buildFromTemplate(template).popup({ window: preview });
    });
    preview.on("closed", () => {
      this.translations.cancel();
      if (this.previewWindow === preview) {
        this.cancelOcrTask("preview-closed");
        this.previewWindow = null;
      }
      this.previewData = null;
      this.previewImageBuffer = null;
      this.previewDisplay = null;
    });
    preview.on("move", () => {
      if (allowMoveTracking) userMoved = true;
    });
    preview.on("close", () => {
      if (userMoved && !preview.isDestroyed()) this.previewPositionStore.save(preview.getBounds());
    });
  }

  resizePreview(content = {}) {
    const preview = this.previewWindow;
    const display = this.previewDisplay;
    if (!preview || preview.isDestroyed() || !display) return;
    const bounds = preview.getBounds();
    const height = calculatePreviewHeight({
      ...content,
      workAreaHeight: display.workArea.height
    });
    if (Math.abs(bounds.height - height) < 12) return;
    const y = Math.min(
      Math.max(
        display.workArea.y,
        bounds.y + Math.round((bounds.height - height) / 2)
      ),
      display.workArea.y + display.workArea.height - height
    );
    preview.setBounds({ x: bounds.x, y, width: bounds.width, height }, true);
  }

  closePreview({ cancelRecognition = true } = {}) {
    if (cancelRecognition) this.cancelOcrTask("preview-closed");
    this.translations.cancel();
    if (this.previewWindow && !this.previewWindow.isDestroyed()) {
      this.previewWindow.destroy();
    }
    this.previewWindow = null;
    this.previewData = null;
    this.previewImageBuffer = null;
    this.previewDisplay = null;
  }

  closeAll({ restoreBall = true } = {}) {
    clearTimeout(this.fullscreenOverlayTimer);
    this.fullscreenOverlayTimer = null;
    this.cancelOcrTask("shutdown");
    this.translations.cancel();
    if (this.session) {
      if (restoreBall) {
        this.finishSession();
      } else {
        const overlay = this.session.overlay;
        this.session = null;
        if (overlay && !overlay.isDestroyed()) overlay.hide();
      }
    }
    this.closePreview();
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      this.overlayWindow.destroy();
    }
    this.overlayWindow = null;
    this.overlayLoadPromise = null;
    this.continuous.dispose();
    this.overlays.dispose();
  }
}

module.exports = {
  FULLSCREEN_MAX_REGIONS,
  FULLSCREEN_TRANSLATION_CONCURRENCY,
  RegionCaptureController,
  selectTranslatableFullscreenRegions,
  splitFullscreenTranslationText,
  translateFullscreenRegions
};
