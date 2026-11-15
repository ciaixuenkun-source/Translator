const test = require("node:test");
const assert = require("node:assert/strict");
const {
  API_KEY_CREDENTIAL,
  SILICONFLOW_API_KEY_CREDENTIAL,
  MODELSCOPE_TOKEN_CREDENTIAL,
  TranslatorSettingsService
} = require("../src/services/translator/translator-settings-service");
const { ModelScopeQwenProvider } = require("../src/services/translator/providers/modelscope-qwen-provider");

class MemoryConfigStore {
  read() { return { mode: "free", preferFree: true, provider: "openai-compatible", baseUrl: "", model: "", timeoutMs: 30000 }; }
  write() {}
}
class MemoryCredentialStore {
  constructor(values = {}) { this.values = { ...values }; }
  get(key) { return this.values[key] || null; }
  set(key, value) { this.values[key] = value; }
  has(key) { return Boolean(this.values[key]); }
}

function createService(credentials = {}, fetchImpl) {
  const credentialStore = new MemoryCredentialStore(credentials);
  const service = new TranslatorSettingsService({ setProviders() {}, setDefaultMode() {} }, {
    configStore: new MemoryConfigStore(), credentialStore, freeProvider: {}
  });
  if (fetchImpl) {
    service.buildModelScopeProvider = (apiKey) => new ModelScopeQwenProvider({ apiKey, fetchImpl });
  }
  return { service, credentialStore };
}

test("stores ModelScope token independently from other credentials", () => {
  const { service, credentialStore } = createService({
    [API_KEY_CREDENTIAL]: "deepseek-key",
    [SILICONFLOW_API_KEY_CREDENTIAL]: "siliconflow-key"
  });
  const result = service.saveModelScope({ token: "modelscope-token" });
  assert.equal(result.ok, true);
  assert.equal(credentialStore.get(MODELSCOPE_TOKEN_CREDENTIAL), "modelscope-token");
  assert.equal(credentialStore.get(API_KEY_CREDENTIAL), "deepseek-key");
  assert.equal(credentialStore.get(SILICONFLOW_API_KEY_CREDENTIAL), "siliconflow-key");
  assert.equal(result.snapshot.freeOnline.modelScope.hasApiKey, true);
  assert.equal(JSON.stringify(result).includes("modelscope-token"), false);
});

test("manual provider selection invokes only the selected ModelScope credential", async () => {
  let authorization;
  const { service } = createService({
    [MODELSCOPE_TOKEN_CREDENTIAL]: "saved-modelscope-token",
    [SILICONFLOW_API_KEY_CREDENTIAL]: "siliconflow-key"
  }, async (_url, options) => {
    authorization = options.headers.Authorization;
    return new Response(JSON.stringify({ choices: [{ message: { content: "撤退！敌人太强了！" } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  });
  const result = await service.translateFreeOnline({
    provider: "modelscope",
    text: "We need to retreat! The enemy is too strong!",
    sourceLanguage: "en",
    targetLanguage: "zh-CN"
  });
  assert.equal(authorization, "Bearer saved-modelscope-token");
  assert.equal(result.provider, "modelscope-ling-3-flash");
});

test("missing ModelScope token does not fall back to SiliconFlow", async () => {
  const { service } = createService({ [SILICONFLOW_API_KEY_CREDENTIAL]: "siliconflow-key" });
  await assert.rejects(
    service.translateFreeOnline({ provider: "modelscope", text: "hello", sourceLanguage: "en", targetLanguage: "zh-CN" }),
    (error) => error.code === "free-online-not-configured" && /魔搭/.test(error.message)
  );
});
