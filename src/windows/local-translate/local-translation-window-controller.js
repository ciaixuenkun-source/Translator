const path = require("path");
const { app, BrowserWindow, Menu, clipboard, ipcMain, screen } = require("electron");
const { APP_ICON_PATH, APP_NAME, applyWindowAppDetails } = require("../../app-assets");
const { AI_PRECISE_MODE, AUTO_MODE, FREE_MODE, LOCAL_MODE } = require("../../services/translator/translation-modes");
const { LocalTranslationQueue } = require("../../services/translator/local-translation-queue");
const {
  LOCAL_TRANSLATION_LANGUAGES,
  buildLocalBilingualPrompt,
  isLocalTranslationLanguage
} = require("../../services/translator/local-bilingual-prompt");
const { LanguagePreferencesStore, normalizeDirection } = require("./language-preferences-store");

const FREE_SOURCE_PROVIDERS = Object.freeze({
  free_siliconflow: "siliconflow",
  free_modelscope: "modelscope",
  free_baidu: "baidu",
  free_aliyun: "aliyun"
});

const FRIENDLY_ERRORS = Object.freeze({
  "paid-api-disabled": "\u8bf7\u5148\u5728\u57fa\u7840\u8bbe\u7f6e\u4e2d\u5f00\u542f\u201c\u5141\u8bb8\u4f7f\u7528\u4ed8\u8d39 API\u201d\u3002",
  "provider-not-configured": "尚未配置 AI 精译，请先在设置中配置服务商、模型和 API Key。",
  "free-online-not-configured": "请先在设置中配置免费在线翻译。",
  "api-key-invalid": "API Key 无效，请在设置中检查。",
  "model-unavailable": "所选 AI 模型不可用。",
  "network-error": "AI 翻译网络连接失败。",
  "rate-limited": "AI 请求过于频繁，请稍后重试。",
  "free-quota-exhausted": "魔粒余额不足，请前往魔搭官网查看额度。",
  "translation-cancelled": "翻译已取消。",
  "local-model-not-configured": "本地翻译尚未配置，请检查本地模型设置。",
  "local-runtime-unavailable": "未找到本地 llama.cpp 运行环境。",
  "local-model-unavailable": "未找到本地 Qwen 模型。",
  "local-model-start-failed": "本地翻译模型启动失败。",
  "local-request-failed": "本地翻译暂时失败。",
  "request-timeout": "翻译请求超时。",
  "empty-response": "翻译服务没有返回有效译文。"
  ,"unchanged-response": "翻译服务返回了未翻译的原文。"
});

function sourceForSceneMethod(method, translatorSnapshot = {}, savedSource = "local_qwen") {
  if (method === "free-online") return "free_auto";
  if (method === "ai-api") return "ai_api";
  if (method === "local") return "local_qwen";
  return "auto";
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function nextWindowBounds(workArea, sequence, size = { width: 680, height: 600 }) {
  const step = (sequence % 7) * 26;
  const baseX = workArea.x + Math.round((workArea.width - size.width) / 2);
  const baseY = workArea.y + Math.round((workArea.height - size.height) / 2);
  return {
    x: clamp(baseX + step, workArea.x, workArea.x + workArea.width - size.width),
    y: clamp(baseY + step, workArea.y, workArea.y + workArea.height - size.height),
    ...size
  };
}

function nextUnifiedPinState(pinnedStates) {
  if (!pinnedStates.length) return false;
  return pinnedStates.filter(Boolean).length <= pinnedStates.length / 2;
}

async function performLocalTranslation({
  translatorService,
  translatorSettings,
  queue,
  text,
  sourceLanguage,
  targetLanguage,
  signal,
  onChunk,
  onStatus,
  source = "local_qwen"
}) {
  if (sourceLanguage === targetLanguage) {
    return { text, warnings: [], provider: "passthrough" };
  }
  const instructions = buildLocalBilingualPrompt(sourceLanguage, targetLanguage);
  if (Object.hasOwn(FREE_SOURCE_PROVIDERS, source)) {
    if (!translatorSettings?.translateFreeOnline) {
      const error = new Error("免费在线翻译不可用。");
      error.code = "free-online-not-configured";
      throw error;
    }
    return translatorSettings.translateFreeOnline({
      text,
      sourceLanguage,
      targetLanguage,
      signal,
      provider: FREE_SOURCE_PROVIDERS[source]
    });
  }
  if (source === "ai_api" && translatorSettings?.isPaidApiAllowed?.() === false) {
    const error = new Error("Please enable paid API access in Basic Settings before using AI precise translation.");
    error.code = "paid-api-disabled";
    throw error;
  }
  const mode = source === "auto" ? AUTO_MODE
    : source === "free_auto" ? FREE_MODE
      : source === "ai_api" ? AI_PRECISE_MODE : LOCAL_MODE;
  const task = () => translatorService.translate(text, {
    mode,
    sourceLanguage,
    targetLanguage,
    instructions,
    signal,
    onChunk,
    onStatus,
    includeDetails: true
  });
  return mode === LOCAL_MODE ? queue.run(task, signal) : task();
}

class LocalTranslationWindowController {
  constructor(translatorService, translatorSettings, options = {}) {
    this.translatorService = translatorService;
    this.translatorSettings = translatorSettings;
    this.windows = new Map();
    this.sequence = 0;
    this.queue = new LocalTranslationQueue();
    this.languagePreferences = options.languagePreferences || new LanguagePreferencesStore(
      path.join(app.getPath("userData"), "local-translation-languages.json")
    );
    this.onLanguagePreferencesChanged = options.onLanguagePreferencesChanged || (() => {});
    this.registerIpc();
  }

  recordFor(sender) {
    return this.windows.get(sender.id) || null;
  }

  registerIpc() {
    ipcMain.handle("local-translate-bootstrap", (event) => {
      const record = this.recordFor(event.sender);
      if (!record) return null;
      const direction = record.direction;
      const ai = this.translatorSettings?.getSnapshot?.() || null;
      const selectedSource = sourceForSceneMethod(
        this.languagePreferences.readMethod(record.mode === "game" ? "game" : "normalAlt3"),
        ai,
        this.languagePreferences.readSource(record.mode)
      );
      return {
        languages: LOCAL_TRANSLATION_LANGUAGES,
        sourceLanguage: direction.sourceLanguage,
        targetLanguage: direction.targetLanguage,
        mode: record.mode,
        pinned: record.pinned,
        sources: [
          { id: "auto", label: "跟随默认设置", available: true },
          { id: "free_auto", label: "免费在线 · 自动备用", available: true },
          { id: "free_siliconflow", label: "免费在线 · 硅基流动", available: true },
          { id: "free_modelscope", label: "免费在线 · 魔搭", available: true },
          { id: "free_baidu", label: "免费在线 · 百度", available: true },
          { id: "free_aliyun", label: "免费在线 · 阿里云", available: true },
          { id: "ai_api", label: "AI 精译", available: true },
          { id: "local_qwen", label: "本地模型", available: true }
        ],
        selectedSource,
        ai
      };
    });

    ipcMain.handle("local-translate-save-languages", (event, direction) => {
      const record = this.recordFor(event.sender);
      if (!record) return null;
      record.direction = normalizeDirection(direction, record.direction);
      return record.direction;
    });

    ipcMain.handle("local-translate-save-source", (event, source) => {
      const record = this.recordFor(event.sender);
      if (!record) return null;
      return this.languagePreferences.writeSource(record.mode, source);
    });

    ipcMain.handle("local-translate-request", async (event, payload) => {
      const record = this.recordFor(event.sender);
      if (!record) return { ok: false, message: "当前窗口无法发起翻译。" };
      const requestId = payload?.requestId;
      const text = payload?.text;
      const sourceLanguage = payload?.sourceLanguage;
      const targetLanguage = payload?.targetLanguage;
      const source = payload?.source;
      if (
        typeof requestId !== "string" ||
        typeof text !== "string" ||
        !text.trim() ||
        text.length > 100000 ||
        !isLocalTranslationLanguage(sourceLanguage) ||
        !isLocalTranslationLanguage(targetLanguage) ||
        !["auto", "free_auto", ...Object.keys(FREE_SOURCE_PROVIDERS), "ai_api", "local_qwen"].includes(source)
      ) {
        return { ok: false, message: text?.trim() ? "翻译请求无效。" : "请先输入需要翻译的内容。" };
      }
      if (record.activeRequest) {
        return { ok: false, code: "request-active", message: "当前窗口正在翻译，请稍候。" };
      }

      const controller = new AbortController();
      record.activeRequest = { requestId, controller };
      const send = (channel, detail = {}) => {
        if (
          controller.signal.aborted ||
          record.activeRequest?.requestId !== requestId ||
          event.sender.isDestroyed()
        ) return;
        event.sender.send(channel, { requestId, ...detail });
      };

      try {
        const result = await performLocalTranslation({
          translatorService: this.translatorService,
          translatorSettings: this.translatorSettings,
          queue: this.queue,
          text,
          sourceLanguage,
          targetLanguage,
          signal: controller.signal,
          onChunk: (delta) => send("local-translate-chunk", { delta }),
          onStatus: (status) => send("local-translate-status", { status }),
          source
        });
        if (controller.signal.aborted || record.activeRequest?.requestId !== requestId) {
          return { ok: false, code: "translation-cancelled", message: FRIENDLY_ERRORS["translation-cancelled"] };
        }
        return { ok: true, ...result };
      } catch (error) {
        const code = error?.code || (error?.name === "AbortError" ? "translation-cancelled" : "translation-failed");
        return {
          ok: false,
          code,
          message: FRIENDLY_ERRORS[code] || "翻译失败，请稍后重试。"
        };
      } finally {
        if (record.activeRequest?.requestId === requestId) record.activeRequest = null;
      }
    });

    ipcMain.on("local-translate-cancel", (event, requestId) => {
      const record = this.recordFor(event.sender);
      if (record?.activeRequest?.requestId !== requestId) return;
      const active = record.activeRequest;
      record.activeRequest = null;
      active.controller.abort();
    });

    ipcMain.handle("local-translate-copy", (event, text) => {
      if (!this.recordFor(event.sender) || typeof text !== "string" || !text) return false;
      clipboard.writeText(text);
      return true;
    });

    ipcMain.handle("local-translate-set-pinned", (event, pinned) => {
      const record = this.recordFor(event.sender);
      if (!record || record.window.isDestroyed()) return false;
      record.pinned = Boolean(pinned);
      record.window.setAlwaysOnTop(record.pinned, "floating");
      return record.pinned;
    });

    ipcMain.handle("local-translate-toggle-all-pinned", (event) => {
      if (!this.recordFor(event.sender)) return false;
      const records = [...this.windows.values()].filter(({ window }) => !window.isDestroyed());
      if (!records.length) return false;
      const nextPinned = nextUnifiedPinState(records.map((record) => record.pinned));
      for (const record of records) {
        record.pinned = nextPinned;
        record.window.setAlwaysOnTop(nextPinned, "floating");
        record.window.webContents.send("local-translate-pin-state", nextPinned);
      }
      return nextPinned;
    });

    ipcMain.on("local-translate-close", (event) => {
      const record = this.recordFor(event.sender);
      if (record && !record.window.isDestroyed()) record.window.close();
    });
  }

  open(mode = "normal") {
    const windowMode = mode === "game" ? "game" : "normal";
    const windowSize = windowMode === "game"
      ? { width: 410, height: 360 }
      : { width: 680, height: 600 };
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const bounds = nextWindowBounds(display.workArea, this.sequence++, windowSize);
    const window = new BrowserWindow({
      ...bounds,
      minWidth: windowMode === "game" ? 380 : 540,
      minHeight: windowMode === "game" ? 330 : 470,
      show: false,
      frame: false,
      resizable: true,
      fullscreenable: false,
      alwaysOnTop: false,
      skipTaskbar: false,
      transparent: windowMode === "game",
      backgroundColor: windowMode === "game" ? "#dceeff9e" : "#fff8ea",
      title: APP_NAME,
      icon: APP_ICON_PATH,
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    applyWindowAppDetails(window);
    const directionKey = windowMode === "game" ? "game" : "normalAlt3";
    const record = {
      window,
      mode: windowMode,
      direction: this.languagePreferences.read(directionKey),
      pinned: false,
      activeRequest: null
    };
    const senderId = window.webContents.id;
    this.windows.set(senderId, record);

    window.loadFile(path.join(__dirname, "index.html"));
    window.once("ready-to-show", () => {
      if (window.isDestroyed()) return;
      window.show();
      window.focus();
    });
    window.webContents.on("context-menu", (_event, params) => {
      const template = [];
      if (params.isEditable && params.selectionText) template.push({ label: "剪切", role: "cut" });
      if (params.selectionText) template.push({ label: "复制", role: "copy" });
      if (params.isEditable) template.push({ label: "粘贴", role: "paste" });
      if (params.isEditable || params.selectionText) {
        template.push({ type: "separator" }, { label: "全选", role: "selectAll" });
      }
      if (template.length) Menu.buildFromTemplate(template).popup({ window });
    });
    window.on("closed", () => {
      record.activeRequest?.controller.abort();
      this.windows.delete(senderId);
    });
    return window;
  }

  closeAll() {
    for (const record of this.windows.values()) {
      record.activeRequest?.controller.abort();
      if (!record.window.isDestroyed()) record.window.destroy();
    }
    this.windows.clear();
  }
}

module.exports = {
  LocalTranslationWindowController,
  nextWindowBounds,
  nextUnifiedPinState,
  performLocalTranslation,
  sourceForSceneMethod
};
