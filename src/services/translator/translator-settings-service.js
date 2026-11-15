const { SecureCredentialStore } = require("./secure-credential-store");
const {
  DEFAULT_TRANSLATOR_CONFIG,
  TranslatorConfigStore
} = require("./translator-config-store");
const { TranslatorError } = require("./errors");
const { SCIENTIFIC_TRANSLATION_INSTRUCTIONS } = require("./prompt");
const {
  OpenAICompatibleProvider
} = require("./providers/openai-compatible-provider");
const {
  SILICONFLOW_BASE_URL,
  SILICONFLOW_HUNYUAN_MT_MODEL,
  SILICONFLOW_PROVIDER_LABEL,
  SiliconFlowHunyuanProvider
} = require("./providers/siliconflow-hunyuan-provider");
const {
  MODELSCOPE_BASE_URL,
  MODELSCOPE_QWEN3_MODEL,
  MODELSCOPE_PROVIDER_LABEL,
  ModelScopeQwenProvider
} = require("./providers/modelscope-qwen-provider");
const { BaiduTranslationProvider } = require("./providers/baidu-translation-provider");
const { AliyunTranslationProvider } = require("./providers/aliyun-translation-provider");
const { UnconfiguredProvider } = require("./providers/unconfigured-provider");
const { AutomaticTranslationProvider } = require("./automatic-translation-provider");
const { PaidPermissionProvider } = require("./providers/paid-permission-provider");
const {
  AI_PRECISE_MODE,
  AUTO_MODE,
  FREE_MODE,
  LOCAL_MODE,
  TRANSLATION_MODES,
  getTranslationMode,
  preferredModeFromConfig
} = require("./translation-modes");

const API_KEY_CREDENTIAL = "openai-compatible.api-key";
const SILICONFLOW_API_KEY_CREDENTIAL = "siliconflow.hunyuan-mt.api-key";
// Keep the legacy credential key so existing encrypted tokens migrate without being rewritten.
const MODELSCOPE_TOKEN_CREDENTIAL = "modelscope.qwen3-8b.access-token";
const BAIDU_APP_ID_CREDENTIAL = "baidu-translate.app-id";
const BAIDU_SECRET_CREDENTIAL = "baidu-translate.secret-key";
const ALIYUN_ACCESS_KEY_ID_CREDENTIAL = "aliyun-translate.access-key-id";
const ALIYUN_ACCESS_KEY_SECRET_CREDENTIAL = "aliyun-translate.access-key-secret";
const FREE_PROVIDER_IDS = Object.freeze(["siliconflow", "modelscope", "baidu", "aliyun"]);

function validateBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new TranslatorError("API 地址无效", { code: "invalid-base-url" });
  }

  const localHttp =
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !localHttp) {
    throw new TranslatorError("API 地址必须使用 HTTPS", {
      code: "invalid-base-url"
    });
  }
  if (url.username || url.password) {
    throw new TranslatorError("API 地址中不能包含账号或密码", {
      code: "invalid-base-url"
    });
  }
  return value.trim().replace(/\/+$/, "");
}

class TranslatorSettingsService {
  constructor(
    translatorService,
    {
      configStore = new TranslatorConfigStore(),
      credentialStore = new SecureCredentialStore(),
      freeProvider
    } = {}
  ) {
    this.translatorService = translatorService;
    this.configStore = configStore;
    this.credentialStore = credentialStore;
    this.freeProvider = freeProvider;
    this.connectionStatus = { siliconflow: "unknown", modelscope: "unknown", baidu: "unknown", aliyun: "unknown" };
    this.applySavedConfiguration();
  }

  normalizedConfig(input = {}) {
    const timeoutMs = Number(input.timeoutMs || DEFAULT_TRANSLATOR_CONFIG.timeoutMs);
    const rawBaseUrl = String(input.baseUrl || "").trim();
    return {
      mode: getTranslationMode(input.mode)?.id || AI_PRECISE_MODE,
      preferFree: Boolean(input.preferFree),
      provider: "openai-compatible",
      baseUrl: rawBaseUrl ? validateBaseUrl(rawBaseUrl) : "",
      model: String(input.model || "").trim(),
      timeoutMs: Number.isFinite(timeoutMs)
        ? Math.min(Math.max(timeoutMs, 5000), 120000)
        : DEFAULT_TRANSLATOR_CONFIG.timeoutMs,
      defaultTranslationMethod: ["free-online", "ai-api", "local"].includes(input.defaultTranslationMethod)
        ? input.defaultTranslationMethod
        : DEFAULT_TRANSLATOR_CONFIG.defaultTranslationMethod,
      allowPaidApi: input.allowPaidApi === true,
      preferredFreeProvider: FREE_PROVIDER_IDS.includes(input.preferredFreeProvider) ? input.preferredFreeProvider : "siliconflow"
      ,freeProviderBenchmarks: input.freeProviderBenchmarks && typeof input.freeProviderBenchmarks === "object"
        ? input.freeProviderBenchmarks : {}
    };
  }

  buildProvider(config, apiKey) {
    return new OpenAICompatibleProvider({ ...config, apiKey });
  }

  buildSiliconFlowProvider(apiKey) {
    return new SiliconFlowHunyuanProvider({ apiKey });
  }

  buildModelScopeProvider(apiKey) {
    return new ModelScopeQwenProvider({ apiKey });
  }

  buildBaiduProvider(appId, secretKey) { return new BaiduTranslationProvider({ appId, secretKey }); }
  buildAliyunProvider(accessKeyId, accessKeySecret) { return new AliyunTranslationProvider({ accessKeyId, accessKeySecret }); }

  automaticRoute(config, providers) {
    const local = { id: "local", provider: providers.local };
    const ai = { id: "ai-api", provider: providers.ai };
    const order = [config.preferredFreeProvider, ...FREE_PROVIDER_IDS.filter(id => id !== config.preferredFreeProvider)];
    const free = order.map(id => ({ id, provider: providers[id] }));
    if (config.defaultTranslationMethod === "local") return [local];
    if (config.defaultTranslationMethod === "ai-api") {
      return config.allowPaidApi ? [ai, local] : [local];
    }
    return [...free, ...(config.allowPaidApi ? [ai] : []), local];
  }

  freeOnlineRoute(config, providers) {
    const order = [config.preferredFreeProvider, ...FREE_PROVIDER_IDS.filter(id => id !== config.preferredFreeProvider)];
    return order.map(id => ({ id, provider: providers[id] }));
  }

  applyProviders(config, apiKey) {
    const aiProvider = this.buildProvider(config, apiKey);
    const permittedAiProvider = new PaidPermissionProvider(aiProvider, {
      isAllowed: () => this.configStore.read().allowPaidApi === true
    });
    const siliconflow = this.buildSiliconFlowProvider(
      this.credentialStore.get(SILICONFLOW_API_KEY_CREDENTIAL) || ""
    );
    const modelscope = this.buildModelScopeProvider(
      this.credentialStore.get(MODELSCOPE_TOKEN_CREDENTIAL) || ""
    );
    const baidu = this.buildBaiduProvider(this.credentialStore.get(BAIDU_APP_ID_CREDENTIAL) || "", this.credentialStore.get(BAIDU_SECRET_CREDENTIAL) || "");
    const aliyun = this.buildAliyunProvider(this.credentialStore.get(ALIYUN_ACCESS_KEY_ID_CREDENTIAL) || "", this.credentialStore.get(ALIYUN_ACCESS_KEY_SECRET_CREDENTIAL) || "");
    const providers = {
      local: this.freeProvider,
      ai: aiProvider.isConfigured() ? permittedAiProvider : new UnconfiguredProvider(),
      siliconflow,
      modelscope, baidu, aliyun
    };
    const automatic = new AutomaticTranslationProvider({
      configProvider: () => this.configStore.read(),
      routeForConfig: (latest) => this.automaticRoute(latest, providers)
    });
    const freeOnline = new AutomaticTranslationProvider({
      configProvider: () => this.configStore.read(),
      routeForConfig: (latest) => this.freeOnlineRoute(latest, providers)
    });
    this.translatorService.setProviders({
      [FREE_MODE]: freeOnline,
      [AI_PRECISE_MODE]: providers.ai,
      [LOCAL_MODE]: this.freeProvider,
      [AUTO_MODE]: automatic
    });
    this.translatorService.setDefaultMode(AUTO_MODE);
  }

  applySavedConfiguration() {
    const config = this.configStore.read();
    const apiKey = this.credentialStore.get(API_KEY_CREDENTIAL);
    this.applyProviders(config, apiKey);
  }

  getSnapshot() {
    const config = this.configStore.read();
    return {
      mode: FREE_MODE,
      preferredMode: FREE_MODE,
      preferFree: config.preferFree,
      modes: TRANSLATION_MODES,
      provider: config.provider,
      providerLabel: "OpenAI Compatible",
      baseUrl: config.baseUrl,
      model: config.model,
      hasApiKey: this.credentialStore.has(API_KEY_CREDENTIAL),
      defaultTranslationMethod: config.defaultTranslationMethod,
      allowPaidApi: config.allowPaidApi,
      preferredFreeProvider: config.preferredFreeProvider,
      freeProviderBenchmarks: config.freeProviderBenchmarks,
      connectionStatus: { ...this.connectionStatus },
      freeOnline: this.getFreeOnlineSnapshot()
    };
  }

  getFreeOnlineSnapshot() {
    const hasApiKey = this.credentialStore.has(SILICONFLOW_API_KEY_CREDENTIAL);
    const modelScopeConfigured = this.credentialStore.has(MODELSCOPE_TOKEN_CREDENTIAL);
    return {
      provider: "siliconflow",
      providerLabel: "硅基流动 SiliconFlow",
      model: SILICONFLOW_HUNYUAN_MT_MODEL,
      modelLabel: "Hunyuan-MT-7B",
      baseUrl: SILICONFLOW_BASE_URL,
      status: hasApiKey ? "configured" : "unconfigured",
      statusLabel: hasApiKey ? "已安全保存" : "未配置",
      hasApiKey,
      modelScope: {
        provider: "modelscope",
        providerLabel: "魔搭社区 ModelScope",
        model: MODELSCOPE_QWEN3_MODEL,
        modelLabel: "Ling-3.0-flash",
        baseUrl: MODELSCOPE_BASE_URL,
        status: modelScopeConfigured ? "configured" : "unconfigured",
        statusLabel: modelScopeConfigured ? "已安全保存" : "未配置",
        hasApiKey: modelScopeConfigured
      },
      baidu: { provider: "baidu", providerLabel: "百度翻译", model: "通用翻译 API", status: this.credentialStore.has(BAIDU_APP_ID_CREDENTIAL) && this.credentialStore.has(BAIDU_SECRET_CREDENTIAL) ? "configured" : "unconfigured", hasApiKey: this.credentialStore.has(BAIDU_APP_ID_CREDENTIAL) && this.credentialStore.has(BAIDU_SECRET_CREDENTIAL) },
      aliyun: { provider: "aliyun", providerLabel: "阿里云机器翻译", model: "通用版", status: this.credentialStore.has(ALIYUN_ACCESS_KEY_ID_CREDENTIAL) && this.credentialStore.has(ALIYUN_ACCESS_KEY_SECRET_CREDENTIAL) ? "configured" : "unconfigured", hasApiKey: this.credentialStore.has(ALIYUN_ACCESS_KEY_ID_CREDENTIAL) && this.credentialStore.has(ALIYUN_ACCESS_KEY_SECRET_CREDENTIAL) }
    };
  }

  providerCredentials(service, input = {}) {
    const definitions = {
      siliconflow: [[SILICONFLOW_API_KEY_CREDENTIAL, "apiKey"]], modelscope: [[MODELSCOPE_TOKEN_CREDENTIAL, "apiKey"]],
      baidu: [[BAIDU_APP_ID_CREDENTIAL, "appId"], [BAIDU_SECRET_CREDENTIAL, "secretKey"]],
      aliyun: [[ALIYUN_ACCESS_KEY_ID_CREDENTIAL, "accessKeyId"], [ALIYUN_ACCESS_KEY_SECRET_CREDENTIAL, "accessKeySecret"]]
    };
    return Object.fromEntries((definitions[service] || []).map(([key, field]) => [field, String(input[field] || "").trim() || this.credentialStore.get(key) || ""]));
  }

  buildFreeProvider(service, input = {}) {
    if (!FREE_PROVIDER_IDS.includes(service)) {
      throw new TranslatorError("未知的免费翻译服务", { code: "free-provider-invalid" });
    }
    const c = this.providerCredentials(service, input);
    if (service === "modelscope") return this.buildModelScopeProvider(c.apiKey);
    if (service === "baidu") return this.buildBaiduProvider(c.appId, c.secretKey);
    if (service === "aliyun") return this.buildAliyunProvider(c.accessKeyId, c.accessKeySecret);
    return this.buildSiliconFlowProvider(c.apiKey);
  }

  async benchmarkFreeProviders({ text, sourceLanguage, targetLanguage, textType = "custom", signal } = {}) {
    const normalizedText = String(text || "").trim();
    if (!normalizedText) return { ok: false, message: "请输入测速文字" };
    const direction = {
      sourceLanguage: sourceLanguage === "en" ? "en" : "zh-CN",
      targetLanguage: targetLanguage === "zh-CN" ? "zh-CN" : "en"
    };
    const results = {};
    for (const service of FREE_PROVIDER_IDS) {
      if (signal?.aborted) break;
      try {
        const provider = this.buildFreeProvider(service);
        if (!provider.isConfigured()) {
          results[service] = { status: "unconfigured" };
          continue;
        }
        const startedAt = Date.now();
        const result = await provider.translate({ text: normalizedText, ...direction, signal });
        results[service] = {
          status: "success",
          elapsedMs: Math.max(0, Date.now() - startedAt),
          text: result.text,
          providerLabel: result.providerLabel || provider.displayName || service
        };
      } catch (error) {
        results[service] = {
          status: error?.code === "translation-cancelled" ? "cancelled" : "failed",
          code: error?.code || "network-error",
          message: error?.message || "测速失败",
          details: error?.details || null
        };
      }
    }
    const config = this.normalizedConfig(this.configStore.read());
    const testedAt = new Date().toISOString();
    const successful = Object.fromEntries(Object.entries(results)
      .filter(([, result]) => result.status === "success")
      .map(([service, result]) => [service, {
        elapsedMs: result.elapsedMs,
        sourceLanguage: direction.sourceLanguage,
        targetLanguage: direction.targetLanguage,
        textType: ["short", "long", "custom"].includes(textType) ? textType : "custom",
        testedAt
      }]));
    config.freeProviderBenchmarks = { ...config.freeProviderBenchmarks, ...successful };
    this.configStore.write(config);
    return { ok: true, results, benchmarks: config.freeProviderBenchmarks };
  }

  saveFreeProvider(service, input = {}) {
    const definitions = {
      siliconflow: [[SILICONFLOW_API_KEY_CREDENTIAL, "apiKey"]], modelscope: [[MODELSCOPE_TOKEN_CREDENTIAL, "apiKey"]],
      baidu: [[BAIDU_APP_ID_CREDENTIAL, "appId"], [BAIDU_SECRET_CREDENTIAL, "secretKey"]], aliyun: [[ALIYUN_ACCESS_KEY_ID_CREDENTIAL, "accessKeyId"], [ALIYUN_ACCESS_KEY_SECRET_CREDENTIAL, "accessKeySecret"]]
    };
    const fields = definitions[service]; if (!fields) return { ok:false, message:"未知翻译服务" };
    const resolved = this.providerCredentials(service, input);
    if (fields.some(([,field]) => !resolved[field])) return { ok:false, message:"请完整填写服务凭据" };
    for (const [key,field] of fields) { const value=String(input[field]||"").trim(); if(value) this.credentialStore.set(key,value); }
    this.applySavedConfiguration(); return { ok:true, message:"设置已安全保存", snapshot:this.getSnapshot() };
  }

  async testFreeProvider(service, input = {}, { signal, translation = false } = {}) {
    try { const provider=this.buildFreeProvider(service,input); if(!provider.isConfigured()) return {ok:false,message:"请先完整填写服务凭据"}; const text=translation?String(input.text||"").trim():"你好"; if(!text)return{ok:false,message:"请输入测试文字"}; const result=await provider.translate({text,sourceLanguage:input.sourceLanguage==="en"?"en":"zh-CN",targetLanguage:input.targetLanguage==="zh-CN"?"zh-CN":"en",signal}); this.connectionStatus[service]="success"; return {ok:true,...result,message:`连接成功 · ${provider.displayName}`}; } catch(error) { this.connectionStatus[service]="error"; return {ok:false,code:error?.code||"network-error",message:error?.message||"网络连接失败",details:error?.details||null}; }
  }

  resolveApiKey(inputKey) {
    return String(inputKey || "").trim() ||
      this.credentialStore.get(API_KEY_CREDENTIAL) || "";
  }

  apiKeyForInput(config, inputKey) {
    const newApiKey = String(inputKey || "").trim();
    const savedConfig = this.configStore.read();
    const providerChanged = Boolean(
      savedConfig.baseUrl && savedConfig.baseUrl !== config.baseUrl
    );
    return {
      apiKey: newApiKey || (providerChanged ? "" : this.credentialStore.get(API_KEY_CREDENTIAL) || ""),
      newApiKey,
      providerChanged
    };
  }

  siliconFlowApiKeyForInput(inputKey) {
    const newApiKey = String(inputKey || "").trim();
    return {
      apiKey: newApiKey || this.credentialStore.get(SILICONFLOW_API_KEY_CREDENTIAL) || "",
      newApiKey
    };
  }

  modelScopeTokenForInput(inputToken) {
    const newToken = String(inputToken || "").trim();
    return {
      apiKey: newToken || this.credentialStore.get(MODELSCOPE_TOKEN_CREDENTIAL) || "",
      newToken
    };
  }

  saveModelScope(input = {}) {
    try {
      const newToken = String(input.apiKey || input.token || "").trim();
      if (!newToken && !this.credentialStore.has(MODELSCOPE_TOKEN_CREDENTIAL)) {
        return { ok: false, message: "请填写魔搭访问令牌" };
      }
      if (newToken) this.credentialStore.set(MODELSCOPE_TOKEN_CREDENTIAL, newToken);
      this.applySavedConfiguration();
      return { ok: true, message: "魔搭社区设置已保存", snapshot: this.getSnapshot() };
    } catch (error) {
      return { ok: false, message: error?.message || "保存失败" };
    }
  }

  async testModelScopeConnection(input = {}, { signal } = {}) {
    try {
      const { apiKey } = this.modelScopeTokenForInput(input.apiKey || input.token);
      if (!apiKey) return { ok: false, code: "api-key-invalid", message: "请先填写魔搭访问令牌" };
      const result = await this.buildModelScopeProvider(apiKey).testConnection({ signal });
      this.connectionStatus.modelscope = "success";
      return { ok: true, message: `连接成功 · ${MODELSCOPE_PROVIDER_LABEL}`, ...result };
    } catch (error) {
      this.connectionStatus.modelscope = "error";
      return {
        ok: false,
        code: error?.code || "network-error",
        message: error?.message || "网络连接失败",
        details: error?.details || null
      };
    }
  }

  async testModelScopeTranslation(input = {}, { signal } = {}) {
    try {
      const { apiKey } = this.modelScopeTokenForInput(input.apiKey || input.token);
      if (!apiKey) return { ok: false, code: "api-key-invalid", message: "请先填写魔搭访问令牌" };
      const text = String(input.text || "").trim();
      if (!text) return { ok: false, code: "empty-input", message: "请输入测试文字" };
      const sourceLanguage = input.sourceLanguage === "en" ? "en" : "zh-CN";
      const targetLanguage = input.targetLanguage === "zh-CN" ? "zh-CN" : "en";
      const result = await this.buildModelScopeProvider(apiKey).translate({
        text, sourceLanguage, targetLanguage, signal
      });
      return { ok: true, ...result };
    } catch (error) {
      return {
        ok: false,
        code: error?.code || "network-error",
        message: error?.message || "网络连接失败",
        details: error?.details || null
      };
    }
  }

  saveFreeOnline(input = {}) {
    try {
      const newApiKey = String(input.apiKey || "").trim();
      if (!newApiKey && !this.credentialStore.has(SILICONFLOW_API_KEY_CREDENTIAL)) {
        return { ok: false, message: "请填写硅基流动 API Key" };
      }
      if (newApiKey) {
        this.credentialStore.set(SILICONFLOW_API_KEY_CREDENTIAL, newApiKey);
      }
      this.applySavedConfiguration();
      return {
        ok: true,
        message: "免费在线翻译设置已保存",
        snapshot: this.getSnapshot()
      };
    } catch (error) {
      return { ok: false, message: error?.message || "保存失败" };
    }
  }

  async testFreeOnlineConnection(input = {}, { signal } = {}) {
    try {
      const { apiKey } = this.siliconFlowApiKeyForInput(input.apiKey);
      if (!apiKey) {
        return { ok: false, code: "api-key-invalid", message: "请先填写硅基流动 API Key" };
      }
      const provider = this.buildSiliconFlowProvider(apiKey);
      const result = await provider.testConnection({ signal });
      this.connectionStatus.siliconflow = "success";
      return {
        ok: true,
        message: `连接成功 · ${SILICONFLOW_PROVIDER_LABEL}`,
        providerLabel: result.providerLabel,
        model: result.model,
        responseTimeMs: result.responseTimeMs
      };
    } catch (error) {
      this.connectionStatus.siliconflow = "error";
      return {
        ok: false,
        code: error?.code || "network-error",
        message: error?.message || "网络连接失败"
      };
    }
  }

  async testFreeOnlineTranslation(input = {}, { signal } = {}) {
    try {
      const { apiKey } = this.siliconFlowApiKeyForInput(input.apiKey);
      if (!apiKey) {
        return { ok: false, code: "api-key-invalid", message: "请先填写硅基流动 API Key" };
      }
      const text = String(input.text || "").trim();
      if (!text) return { ok: false, code: "empty-input", message: "请输入测试文字" };
      const sourceLanguage = input.sourceLanguage === "en" ? "en" : "zh-CN";
      const targetLanguage = input.targetLanguage === "zh-CN" ? "zh-CN" : "en";
      const provider = this.buildSiliconFlowProvider(apiKey);
      const result = await provider.translate({
        text,
        sourceLanguage,
        targetLanguage,
        signal
      });
      return { ok: true, ...result };
    } catch (error) {
      return {
        ok: false,
        code: error?.code || "network-error",
        message: error?.message || "网络连接失败"
      };
    }
  }

  async translateFreeOnline({ text, sourceLanguage, targetLanguage, signal, provider = "siliconflow" } = {}) {
    if (!FREE_PROVIDER_IDS.includes(provider)) {
      throw new TranslatorError("未知的免费翻译服务", { code: "free-provider-invalid" });
    }
    const freeProvider = this.buildFreeProvider(provider);
    if (!freeProvider.isConfigured()) {
      const labels = { siliconflow:"硅基流动", modelscope:"魔搭社区", baidu:"百度翻译", aliyun:"阿里云机器翻译" };
      throw new TranslatorError(`请先在设置中完整配置${labels[provider] || "该免费翻译服务"}`, { code:"free-online-not-configured" });
    }
    return freeProvider.translate({
      text,
      sourceLanguage,
      targetLanguage,
      signal
    });
  }

  isPaidApiAllowed() {
    return this.configStore.read().allowPaidApi === true;
  }

  async testConnection(input, { signal } = {}) {
    try {
      const config = this.normalizedConfig(input);
      if (!config.model) {
        return { ok: false, code: "model-unavailable", message: "请填写模型名称" };
      }
      const { apiKey, providerChanged } = this.apiKeyForInput(config, input.apiKey);
      if (!apiKey) {
        return {
          ok: false,
          code: "api-key-invalid",
          message: providerChanged ? "切换服务商后请填写对应的 API Key" : "请填写 API Key"
        };
      }
      const provider = this.buildProvider(config, apiKey);
      await provider.testConnection({
        signal,
        instructions: SCIENTIFIC_TRANSLATION_INSTRUCTIONS
      });
      return { ok: true, message: "连接成功" };
    } catch (error) {
      return {
        ok: false,
        code: error?.code || "network-error",
        message: error?.message || "网络连接失败"
      };
    }
  }

  save(input) {
    try {
      const config = this.normalizedConfig({ ...this.configStore.read(), ...input });
      if (!config.preferFree && !config.baseUrl) {
        return { ok: false, message: "请填写 API 地址" };
      }
      if (!config.preferFree && !config.model) {
        return { ok: false, message: "请填写模型名称" };
      }
      const { apiKey, newApiKey, providerChanged } = this.apiKeyForInput(config, input.apiKey);
      if (!config.preferFree && !apiKey) return { ok: false, message: "请填写 API Key" };
      if (!config.preferFree && providerChanged && !newApiKey) {
        return { ok: false, message: "切换服务商后请填写对应的 API Key" };
      }

      if (newApiKey) this.credentialStore.set(API_KEY_CREDENTIAL, newApiKey);
      this.configStore.write(config);
      this.applyProviders(config, apiKey);
      return { ok: true, message: "翻译服务设置已保存", snapshot: this.getSnapshot() };
    } catch (error) {
      return { ok: false, message: error?.message || "保存失败" };
    }
  }

  saveAutomaticTranslationSettings(input = {}) {
    try {
      const current = this.configStore.read();
      const config = this.normalizedConfig({ ...current, ...input });
      this.configStore.write(config);
      this.applyProviders(config, this.credentialStore.get(API_KEY_CREDENTIAL) || "");
      return { ok: true, message: "Automatic translation settings saved", snapshot: this.getSnapshot() };
    } catch (error) {
      return { ok: false, message: error?.message || "Unable to save settings" };
    }
  }

}

module.exports = {
  API_KEY_CREDENTIAL,
  SILICONFLOW_API_KEY_CREDENTIAL,
  MODELSCOPE_TOKEN_CREDENTIAL,
  BAIDU_APP_ID_CREDENTIAL, BAIDU_SECRET_CREDENTIAL, ALIYUN_ACCESS_KEY_ID_CREDENTIAL, ALIYUN_ACCESS_KEY_SECRET_CREDENTIAL,
  FREE_PROVIDER_IDS,
  TranslatorSettingsService,
  validateBaseUrl
};
