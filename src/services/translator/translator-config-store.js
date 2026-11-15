const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const {
  FREE_MODE,
  resolveTranslationMode
} = require("./translation-modes");

const DEFAULT_TRANSLATOR_CONFIG = Object.freeze({
  mode: FREE_MODE,
  preferFree: true,
  provider: "openai-compatible",
  baseUrl: "",
  model: "",
  timeoutMs: 30000,
  defaultTranslationMethod: "free-online",
  allowPaidApi: false,
  preferredFreeProvider: "siliconflow",
  freeProviderBenchmarks: {}
});

class TranslatorConfigStore {
  constructor(fileName = "translator-config.json") {
    this.filePath = path.join(app.getPath("userData"), fileName);
  }

  read() {
    try {
      const saved = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      return {
        ...DEFAULT_TRANSLATOR_CONFIG,
        ...saved,
        mode: resolveTranslationMode(saved),
        preferFree:
          typeof saved.preferFree === "boolean" ? saved.preferFree : true,
        defaultTranslationMethod: ["free-online", "ai-api", "local"].includes(saved.defaultTranslationMethod)
          ? saved.defaultTranslationMethod
          : (saved.preferFree === false ? "ai-api" : "free-online"),
        allowPaidApi: saved.allowPaidApi === true,
        preferredFreeProvider: ["siliconflow", "modelscope", "baidu", "aliyun"].includes(saved.preferredFreeProvider)
          ? saved.preferredFreeProvider : "siliconflow",
        freeProviderBenchmarks: saved.freeProviderBenchmarks && typeof saved.freeProviderBenchmarks === "object"
          ? saved.freeProviderBenchmarks : {}
      };
    } catch {
      return { ...DEFAULT_TRANSLATOR_CONFIG };
    }
  }

  write(config) {
    const payload = {
      mode: config.mode,
      preferFree: Boolean(config.preferFree),
      provider: config.provider,
      baseUrl: config.baseUrl,
      model: config.model,
      timeoutMs: config.timeoutMs
      ,defaultTranslationMethod: config.defaultTranslationMethod
      ,allowPaidApi: Boolean(config.allowPaidApi)
      ,preferredFreeProvider: config.preferredFreeProvider
      ,freeProviderBenchmarks: config.freeProviderBenchmarks || {}
    };
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(payload, null, 2), "utf8");
    fs.renameSync(temporaryPath, this.filePath);
  }
}

module.exports = { DEFAULT_TRANSLATOR_CONFIG, TranslatorConfigStore };
