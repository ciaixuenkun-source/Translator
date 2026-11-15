const crypto = require("crypto");
const { cleanText } = require("./spatial-text");

function contentKey(text) {
  return crypto.createHash("sha1").update(cleanText(text)).digest("hex");
}

class ContinuousRegionManager {
  constructor({ inspectRegion, onUpdate = () => {}, onError = () => {}, intervalMs = 1600, getIntervalMs = null, setTimer = setTimeout, clearTimer = clearTimeout }) {
    this.inspectRegion = inspectRegion;
    this.onUpdate = onUpdate;
    this.onError = onError;
    this.intervalMs = intervalMs;
    this.getIntervalMs = getIntervalMs;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.regions = new Map();
    this.paused = false;
    this.running = false;
    this.timer = null;
    this.generation = 0;
    this.activeController = null;
  }

  add(region) {
    if (this.regions.size >= 3 || !region?.id) return false;
    this.regions.set(region.id, { ...region, lastKey: "", lastResult: null, status: "waiting" });
    this.schedule(0);
    return true;
  }

  remove(id) { return this.regions.delete(id); }
  snapshot() { return [...this.regions.values()].map((region) => ({ ...region })); }
  pause() { this.paused = true; this.generation += 1; if (this.timer) this.clearTimer(this.timer); this.timer = null; this.activeController?.abort(); }
  resume() { if (!this.paused) return; this.paused = false; this.schedule(0); }
  clear() { this.pause(); this.regions.clear(); this.paused = false; }
  dispose() { this.clear(); }

  currentIntervalMs() {
    const value = Number(this.getIntervalMs?.() ?? this.intervalMs);
    return Number.isFinite(value) ? Math.min(15000, Math.max(1000, value)) : 1600;
  }

  schedule(delay = this.currentIntervalMs()) {
    if (this.paused || this.running || !this.regions.size || this.timer) return;
    this.timer = this.setTimer(() => { this.timer = null; void this.tick(); }, delay);
  }

  async tick() {
    if (this.paused || this.running || !this.regions.size) return;
    this.running = true;
    const generation = this.generation;
    const controller = new AbortController();
    this.activeController = controller;
    try {
      for (const region of this.regions.values()) {
        if (this.paused || generation !== this.generation) break;
        try {
          region.status = "checking";
          const result = await this.inspectRegion({ ...region }, { signal: controller.signal });
          if (this.paused || generation !== this.generation || !this.regions.has(region.id)) break;
          const text = cleanText(result?.sourceText);
          if (!text) { region.status = "empty"; continue; }
          const key = result?.contentKey || contentKey(text);
          if (key === region.lastKey) {
            region.status = "unchanged";
            if (region.lastResult?.translatedText) this.onUpdate({ ...region }, { ...region.lastResult, unchanged: true });
            continue;
          }
          region.lastKey = key;
          region.lastResult = result;
          region.status = result?.translatedText ? "translated" : (result?.clearOverlay ? "skipped" : "translation-error");
          this.onUpdate({ ...region }, result);
        } catch (error) {
          const cancelled = controller.signal.aborted || error?.code === "ocr-cancelled" || error?.code === "translation-cancelled";
          region.status = cancelled ? "cancelled" : "error";
          if (!cancelled) this.onError({ ...region }, error);
        }
      }
    } finally {
      if (this.activeController === controller) this.activeController = null;
      this.running = false;
      this.schedule();
    }
  }
}

module.exports = { ContinuousRegionManager, contentKey };
