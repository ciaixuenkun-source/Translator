const fs = require("fs");
const path = require("path");

const RUNTIME_MODES = Object.freeze({ NORMAL: "normal", GAME: "game" });

function normalizeRuntimeMode(value) {
  return value === RUNTIME_MODES.GAME ? RUNTIME_MODES.GAME : RUNTIME_MODES.NORMAL;
}

class RuntimeModeStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  load() {
    return this.loadState().mode;
  }

  loadState() {
    try {
      const payload = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      return {
        mode: normalizeRuntimeMode(payload.mode),
        normalSnapshot: payload.normalSnapshot && typeof payload.normalSnapshot === "object"
          ? payload.normalSnapshot
          : null
      };
    } catch {
      return { mode: RUNTIME_MODES.NORMAL, normalSnapshot: null };
    }
  }

  save(mode, normalSnapshot = undefined) {
    const normalized = normalizeRuntimeMode(mode);
    const current = this.loadState();
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify({
      version: 1,
      mode: normalized,
      normalSnapshot: normalSnapshot === undefined ? current.normalSnapshot : normalSnapshot
    }, null, 2));
    fs.renameSync(temporaryPath, this.filePath);
    return normalized;
  }
}

module.exports = { RUNTIME_MODES, RuntimeModeStore, normalizeRuntimeMode };
