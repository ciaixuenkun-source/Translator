const crypto = require("crypto");

class GameSessionController {
  constructor({ regionCapture, onRegionStateChange = () => {}, onNotice = () => {} }) {
    this.regionCapture = regionCapture;
    this.onRegionStateChange = onRegionStateChange;
    this.onNotice = onNotice;
    this.regions = [];
    this.fullscreenActive = false;
    this.selectionActive = false;
    this.continuousPaused = false;
    this.generation = 0;
  }

  snapshot() {
    return {
      fullscreenActive: this.fullscreenActive,
      selectionActive: this.selectionActive,
      continuousPaused: this.continuousPaused,
      regions: this.regions.map((region) => ({ ...region }))
    };
  }

  emit() {
    this.onRegionStateChange(this.snapshot());
  }

  async toggleFullscreen() {
    if (this.fullscreenActive) {
      this.generation += 1;
      this.fullscreenActive = false;
      this.regionCapture.cancelRecognition?.("game-fullscreen-toggle");
      this.emit();
      return { cancelled: true };
    }
    const generation = ++this.generation;
    const resumeContinuous = this.regions.length > 0 && !this.continuousPaused;
    if (resumeContinuous) this.regionCapture.pauseContinuousRegions?.();
    this.fullscreenActive = true;
    this.emit();
    try {
      return await this.regionCapture.captureFullScreen({
        context: "game-fullscreen",
        copyImage: false
      });
    } finally {
      if (generation === this.generation) {
        this.fullscreenActive = false;
        if (resumeContinuous) this.regionCapture.resumeContinuousRegions?.();
        this.emit();
      }
    }
  }

  async toggleRegionSelection(trigger = {}) {
    if (this.selectionActive || this.regionCapture.isCapturing?.()) {
      this.selectionActive = false;
      this.regionCapture.cancel("game-region-toggle");
      this.emit();
      return { cancelled: true };
    }
    if (this.regions.length >= 3) {
      if (this.continuousPaused) {
        this.resumeContinuous();
        this.onNotice("持续区域翻译已恢复");
        return { ok: true, resumed: true };
      }
      this.pauseContinuous();
      this.onNotice("已达到 3 个区域，持续翻译已暂停；再次使用区域识别翻译可恢复");
      return { ok: true, paused: true };
    }
    if (this.regionCapture.isActive?.()) {
      this.onNotice("当前识别尚未完成，请稍候再选择下一区域");
      return { ok: false, reason: "busy" };
    }
    this.selectionActive = true;
    const resumeContinuous = this.regions.length > 0 && !this.continuousPaused;
    if (resumeContinuous) this.regionCapture.pauseContinuousRegions?.();
    this.emit();
    const started = await this.regionCapture.start({
      triggeredAt: trigger.triggeredAt,
      context: "game-region",
      selectionOnly: true,
      copyImage: false,
      onSelectionComplete: (selection) => {
        this.selectionActive = false;
        const region = {
          id: crypto.randomUUID(),
          displayId: selection.displayId,
          screenRect: selection.screenRect,
          pixelRect: selection.pixelRect,
          status: "watching"
        };
        if (!this.regionCapture.addContinuousRegion?.(region)) {
          this.onNotice("持续区域启动失败");
          return;
        }
        this.regions.push(region);
        this.emit();
      },
      onTaskStatus: (status) => {
        const region = this.regions[this.regions.length - 1];
        if (region) region.status = status;
        this.emit();
      },
      onFinished: () => {
        this.selectionActive = false;
        if (resumeContinuous) this.regionCapture.resumeContinuousRegions?.();
        this.emit();
      }
    });
    if (!started) {
      this.selectionActive = false;
      if (resumeContinuous) this.regionCapture.resumeContinuousRegions?.();
      this.emit();
    }
    return started;
  }

  clearAll() {
    this.generation += 1;
    this.fullscreenActive = false;
    this.selectionActive = false;
    this.continuousPaused = false;
    this.regions = [];
    this.regionCapture.clearContinuousRegions?.();
    this.regionCapture.cancelRecognition?.("game-clear-all");
    if (this.regionCapture.isCapturing?.()) this.regionCapture.cancel("game-clear-all");
    this.emit();
  }

  pauseContinuous() {
    if (!this.regions.length || this.continuousPaused) return false;
    this.continuousPaused = true;
    this.regionCapture.pauseContinuousRegions?.();
    this.emit();
    return true;
  }

  resumeContinuous() {
    if (!this.continuousPaused) return false;
    this.continuousPaused = false;
    this.regionCapture.resumeContinuousRegions?.();
    this.emit();
    return true;
  }

  dispose() {
    this.clearAll();
  }
}

module.exports = { GameSessionController };
