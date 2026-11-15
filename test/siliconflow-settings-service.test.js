const test = require("node:test");
const assert = require("node:assert/strict");
const {
  API_KEY_CREDENTIAL,
  SILICONFLOW_API_KEY_CREDENTIAL,
  TranslatorSettingsService
} = require("../src/services/translator/translator-settings-service");
const {
  SILICONFLOW_HUNYUAN_MT_MODEL
} = require("../src/services/translator/providers/siliconflow-hunyuan-provider");

class MemoryConfigStore {
  constructor(config = {}) {
    this.config = {
      mode: "free",
      preferFree: true,
      provider: "openai-compatible",
      baseUrl: "",
      model: "",
      timeoutMs: 30000,
      ...config
    };
  }
  read() {
    return { ...this.config };
  }
  write(config) {
    this.config = { ...this.config, ...config };
  }
}

class MemoryCredentialStore {
  constructor(values = {}) {
    this.values = { ...values };
  }
  get(key) {
    return this.values[key] || null;
  }
  set(key, value) {
    this.values[key] = value;
  }
  has(key) {
    return Boolean(this.values[key]);
  }
}

function createService({ credentials = {}, fetchImpl } = {}) {
  const translatorService = {
    setProviders() {},
    setDefaultMode() {}
  };
  const credentialStore = new MemoryCredentialStore(credentials);
  const service = new TranslatorSettingsService(translatorService, {
    configStore: new MemoryConfigStore(),
    credentialStore,
    freeProvider: { isConfigured: () => true }
  });
  if (fetchImpl) {
    service.buildSiliconFlowProvider = (apiKey) =>
      new (require("../src/services/translator/providers/siliconflow-hunyuan-provider").SiliconFlowHunyuanProvider)({
        apiKey,
        fetchImpl
      });
  }
  return { service, credentialStore };
}

function response(content, status = 200) {
  return new Response(JSON.stringify(content), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

test("saves SiliconFlow API Key separately from AI API Key", () => {
  const { service, credentialStore } = createService({
    credentials: { [API_KEY_CREDENTIAL]: "deepseek-key" }
  });
  const result = service.saveFreeOnline({ apiKey: "siliconflow-key" });
  assert.equal(result.ok, true);
  assert.equal(credentialStore.get(API_KEY_CREDENTIAL), "deepseek-key");
  assert.equal(credentialStore.get(SILICONFLOW_API_KEY_CREDENTIAL), "siliconflow-key");
  assert.equal(result.snapshot.freeOnline.hasApiKey, true);
});

test("reports missing SiliconFlow key before testing", async () => {
  const { service } = createService();
  const result = await service.testFreeOnlineConnection({});
  assert.equal(result.ok, false);
  assert.equal(result.code, "api-key-invalid");
  assert.match(result.message, /请先填写/);
});

test("tests SiliconFlow translation with a mock response and records elapsed time", async () => {
  let requestBody;
  const { service } = createService({
    fetchImpl: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return response({ choices: [{ message: { content: "The material is stable." } }] });
    }
  });
  const result = await service.testFreeOnlineTranslation({
    apiKey: "fake-key",
    text: "材料稳定。",
    sourceLanguage: "zh-CN",
    targetLanguage: "en"
  });
  assert.equal(result.ok, true);
  assert.equal(requestBody.model, SILICONFLOW_HUNYUAN_MT_MODEL);
  assert.equal(result.text, "The material is stable.");
  assert.equal(typeof result.responseTimeMs, "number");
});

test("manual free online translation uses saved SiliconFlow key only", async () => {
  let authorization = "";
  const { service } = createService({
    credentials: { [SILICONFLOW_API_KEY_CREDENTIAL]: "saved-free-key" },
    fetchImpl: async (_url, options) => {
      authorization = options.headers.Authorization;
      return response({ choices: [{ message: { content: "Translated text" } }] });
    }
  });
  const result = await service.translateFreeOnline({
    text: "hello",
    sourceLanguage: "en",
    targetLanguage: "zh-CN"
  });
  assert.equal(authorization, "Bearer saved-free-key");
  assert.equal(result.provider, "siliconflow-hunyuan-mt");
});
