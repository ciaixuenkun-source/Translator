const fs = require("fs");
const path = require("path");

const DEFAULT_DIRECTION = Object.freeze({ sourceLanguage: "zh-CN", targetLanguage: "en" });
const DEFAULT_GAME_SCREEN_DIRECTION = Object.freeze({ sourceLanguage: "en", targetLanguage: "zh-CN" });
const DEFAULT_FULLSCREEN_DURATION_SECONDS = 5;
const DEFAULT_TRANSLATION_SOURCE = "local_qwen";
const DEFAULT_SCENE_TRANSLATION_METHOD = "follow-default";
const SCENE_TRANSLATION_METHODS = Object.freeze([
  "follow-default", "free-online", "ai-api", "local"
]);
const TRANSLATION_SOURCES = Object.freeze([
  "free_siliconflow", "free_modelscope", "free_baidu", "free_aliyun", "local_qwen"
]);

function normalizeDirection(value = {}, fallback = DEFAULT_DIRECTION) {
  return {
    sourceLanguage: ["zh-CN", "en"].includes(value.sourceLanguage) ? value.sourceLanguage : fallback.sourceLanguage,
    targetLanguage: ["zh-CN", "en"].includes(value.targetLanguage) ? value.targetLanguage : fallback.targetLanguage
  };
}

function normalizeFullscreenDuration(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_FULLSCREEN_DURATION_SECONDS;
  return Math.round(Math.min(10, Math.max(0.5, numeric)) * 10) / 10;
}

function normalizeSceneTranslationMethod(value) {
  return SCENE_TRANSLATION_METHODS.includes(value)
    ? value
    : DEFAULT_SCENE_TRANSLATION_METHOD;
}

class LanguagePreferencesStore {
  constructor(filePath) { this.filePath = filePath; }

  readAll() {
    try {
      const payload = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      return {
        normal: normalizeDirection(payload.normal),
        normalAlt1: normalizeDirection(payload.normalAlt1 || payload.normal),
        normalAlt2: normalizeDirection(payload.normalAlt2 || payload.normal),
        normalAlt3: normalizeDirection(payload.normalAlt3 || payload.normal),
        game: normalizeDirection(payload.game),
        gameFullscreen: normalizeDirection(payload.gameFullscreen, DEFAULT_GAME_SCREEN_DIRECTION),
        gameRegion: normalizeDirection(payload.gameRegion || payload.gameFullscreen, DEFAULT_GAME_SCREEN_DIRECTION),
        gameFullscreenDurationSeconds: normalizeFullscreenDuration(payload.gameFullscreenDurationSeconds)
        ,normalMethod: normalizeSceneTranslationMethod(payload.normalMethod)
        ,normalAlt1Method: normalizeSceneTranslationMethod(payload.normalAlt1Method || payload.normalMethod)
        ,normalAlt2Method: normalizeSceneTranslationMethod(payload.normalAlt2Method || payload.normalMethod)
        ,normalAlt3Method: normalizeSceneTranslationMethod(payload.normalAlt3Method || payload.normalMethod)
        ,gameMethod: normalizeSceneTranslationMethod(payload.gameMethod)
        ,gameFullscreenMethod: normalizeSceneTranslationMethod(payload.gameFullscreenMethod)
        ,gameRegionMethod: normalizeSceneTranslationMethod(payload.gameRegionMethod)
        ,normalSource: TRANSLATION_SOURCES.includes(payload.normalSource) ? payload.normalSource : DEFAULT_TRANSLATION_SOURCE
        ,gameSource: TRANSLATION_SOURCES.includes(payload.gameSource) ? payload.gameSource : DEFAULT_TRANSLATION_SOURCE
      };
    } catch {
      return {
        normal: { ...DEFAULT_DIRECTION },
        normalAlt1: { ...DEFAULT_DIRECTION },
        normalAlt2: { ...DEFAULT_DIRECTION },
        normalAlt3: { ...DEFAULT_DIRECTION },
        game: { ...DEFAULT_DIRECTION },
        gameFullscreen: { ...DEFAULT_GAME_SCREEN_DIRECTION },
        gameRegion: { ...DEFAULT_GAME_SCREEN_DIRECTION },
        gameFullscreenDurationSeconds: DEFAULT_FULLSCREEN_DURATION_SECONDS
        ,normalMethod: DEFAULT_SCENE_TRANSLATION_METHOD
        ,normalAlt1Method: DEFAULT_SCENE_TRANSLATION_METHOD
        ,normalAlt2Method: DEFAULT_SCENE_TRANSLATION_METHOD
        ,normalAlt3Method: DEFAULT_SCENE_TRANSLATION_METHOD
        ,gameMethod: DEFAULT_SCENE_TRANSLATION_METHOD
        ,gameFullscreenMethod: DEFAULT_SCENE_TRANSLATION_METHOD
        ,gameRegionMethod: DEFAULT_SCENE_TRANSLATION_METHOD
        ,normalSource: DEFAULT_TRANSLATION_SOURCE
        ,gameSource: DEFAULT_TRANSLATION_SOURCE
      };
    }
  }

  readMethod(mode) {
    const key = mode === "normalAlt1" ? "normalAlt1Method"
      : mode === "normalAlt2" ? "normalAlt2Method"
        : mode === "normalAlt3" ? "normalAlt3Method"
          : mode === "gameFullscreen" ? "gameFullscreenMethod"
      : mode === "gameRegion" ? "gameRegionMethod"
        : mode === "game" ? "gameMethod" : "normalMethod";
    return this.readAll()[key];
  }

  writeMethod(mode, method) {
    const key = mode === "normalAlt1" ? "normalAlt1Method"
      : mode === "normalAlt2" ? "normalAlt2Method"
        : mode === "normalAlt3" ? "normalAlt3Method"
          : mode === "gameFullscreen" ? "gameFullscreenMethod"
      : mode === "gameRegion" ? "gameRegionMethod"
        : mode === "game" ? "gameMethod" : "normalMethod";
    const payload = this.readAll();
    payload[key] = normalizeSceneTranslationMethod(method);
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify({ version: 4, ...payload }, null, 2), "utf8");
    fs.renameSync(temporaryPath, this.filePath);
    return payload[key];
  }

  read(mode) {
    const key = ["normalAlt1", "normalAlt2", "normalAlt3", "gameFullscreen", "gameRegion", "game"].includes(mode)
      ? mode
      : "normal";
    return this.readAll()[key];
  }

  write(mode, direction) {
    const key = ["normalAlt1", "normalAlt2", "normalAlt3", "gameFullscreen", "gameRegion", "game"].includes(mode)
      ? mode
      : "normal";
    const payload = this.readAll();
    payload[key] = normalizeDirection(direction);
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify({ version: 5, ...payload }, null, 2), "utf8");
    fs.renameSync(temporaryPath, this.filePath);
    return payload[key];
  }

  writeFullscreenDuration(value) {
    const payload = this.readAll();
    payload.gameFullscreenDurationSeconds = normalizeFullscreenDuration(value);
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify({ version: 2, ...payload }, null, 2), "utf8");
    fs.renameSync(temporaryPath, this.filePath);
    return payload.gameFullscreenDurationSeconds;
  }

  readSource(mode) {
    return this.readAll()[mode === "game" ? "gameSource" : "normalSource"];
  }

  writeSource(mode, source) {
    const payload = this.readAll();
    const key = mode === "game" ? "gameSource" : "normalSource";
    payload[key] = TRANSLATION_SOURCES.includes(source) ? source : DEFAULT_TRANSLATION_SOURCE;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify({ version: 3, ...payload }, null, 2), "utf8");
    fs.renameSync(temporaryPath, this.filePath);
    return payload[key];
  }
}

module.exports = {
  DEFAULT_DIRECTION,
  DEFAULT_GAME_SCREEN_DIRECTION,
  DEFAULT_FULLSCREEN_DURATION_SECONDS,
  DEFAULT_TRANSLATION_SOURCE,
  TRANSLATION_SOURCES,
  DEFAULT_SCENE_TRANSLATION_METHOD,
  SCENE_TRANSLATION_METHODS,
  LanguagePreferencesStore,
  normalizeDirection,
  normalizeFullscreenDuration,
  normalizeSceneTranslationMethod
};
