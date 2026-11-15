const test = require("node:test");
const assert = require("node:assert/strict");
const {
  FREE_PROVIDER_IDS,
  TranslatorSettingsService
} = require("../src/services/translator/translator-settings-service");

function createService(providerDefinitions, initialConfig = {}) {
  let config = {
    mode: "free",
    preferFree: true,
    provider: "openai-compatible",
    baseUrl: "",
    model: "",
    timeoutMs: 30000,
    defaultTranslationMethod: "free-online",
    allowPaidApi: false,
    preferredFreeProvider: "modelscope",
    freeProviderBenchmarks: {},
    ...initialConfig
  };
  const service = Object.create(TranslatorSettingsService.prototype);
  service.configStore = {
    read: () => structuredClone(config),
    write: (next) => { config = structuredClone(next); }
  };
  service.buildFreeProvider = (id) => {
    if (!FREE_PROVIDER_IDS.includes(id)) return TranslatorSettingsService.prototype.buildFreeProvider.call(service, id);
    return providerDefinitions[id];
  };
  return { service, readConfig: () => config };
}

test("manual free provider selection invokes exactly the selected provider", async () => {
  for (const selected of FREE_PROVIDER_IDS) {
    const calls = [];
    const providers = Object.fromEntries(FREE_PROVIDER_IDS.map((id) => [id, {
      isConfigured: () => true,
      translate: async (payload) => { calls.push({ id, payload }); return { text: id, provider: id }; }
    }]));
    const { service } = createService(providers);
    for (const [text, sourceLanguage, targetLanguage] of [
      ["short text", "en", "zh-CN"],
      ["这是一个用于验证手动服务路由、长文本传递和中英方向的较长测试段落。".repeat(12), "zh-CN", "en"]
    ]) {
      calls.length = 0;
      const result = await service.translateFreeOnline({
        provider: selected,
        text,
        sourceLanguage,
        targetLanguage
      });
      assert.equal(result.provider, selected);
      assert.deepEqual(calls.map((call) => call.id), [selected]);
      assert.deepEqual(calls[0].payload, { text, sourceLanguage, targetLanguage, signal: undefined });
    }
  }
});

test("shared service test entry calls only its provider and never returns supplied credentials", async () => {
  for (const selected of FREE_PROVIDER_IDS) {
    const calls = [];
    const providers = Object.fromEntries(FREE_PROVIDER_IDS.map((id) => [id, {
      displayName: id,
      isConfigured: () => true,
      translate: async (payload) => {
        calls.push({ id, payload });
        return { text: `${id} result`, provider: id, providerLabel: id, responseTimeMs: 7 };
      }
    }]));
    const { service } = createService(providers);
    service.connectionStatus = {};
    const result = await service.testFreeProvider(selected, {
      apiKey: "temporary-credential-that-must-not-escape",
      text: "A longer connection-test translation text.",
      sourceLanguage: "en",
      targetLanguage: "zh-CN"
    }, { translation: true });
    assert.equal(result.ok, true);
    assert.equal(result.text, `${selected} result`);
    assert.deepEqual(calls.map((call) => call.id), [selected]);
    assert.deepEqual(calls[0].payload, {
      text: "A longer connection-test translation text.",
      sourceLanguage: "en",
      targetLanguage: "zh-CN",
      signal: undefined
    });
    assert.doesNotMatch(JSON.stringify(result), /temporary-credential-that-must-not-escape/);
  }
});

test("manual free provider selection rejects unknown values instead of falling back to SiliconFlow", async () => {
  let calls = 0;
  const providers = Object.fromEntries(FREE_PROVIDER_IDS.map((id) => [id, {
    isConfigured: () => true,
    translate: async () => { calls += 1; return { text: id }; }
  }]));
  const { service } = createService(providers);
  await assert.rejects(
    service.translateFreeOnline({ provider: "free_online", text: "hello", sourceLanguage: "en", targetLanguage: "zh-CN" }),
    (error) => error.code === "free-provider-invalid"
  );
  assert.equal(calls, 0);
});

test("one-click benchmark uses identical conditions, skips unconfigured providers, and continues after failure", async () => {
  const calls = [];
  const providers = {
    siliconflow: { isConfigured: () => true, translate: async (payload) => { calls.push(["siliconflow", payload]); return { text: "one" }; } },
    modelscope: { isConfigured: () => true, translate: async (payload) => { calls.push(["modelscope", payload]); throw Object.assign(new Error("limited"), { code: "rate-limited" }); } },
    baidu: { isConfigured: () => false, translate: async () => { throw new Error("must not run"); } },
    aliyun: { isConfigured: () => true, translate: async (payload) => { calls.push(["aliyun", payload]); return { text: "four" }; } }
  };
  const { service, readConfig } = createService(providers);
  const result = await service.benchmarkFreeProviders({
    text: "The catalyst remained stable for 24 h.",
    sourceLanguage: "en",
    targetLanguage: "zh-CN",
    textType: "short"
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls.map(([id]) => id), ["siliconflow", "modelscope", "aliyun"]);
  for (const [, payload] of calls) {
    assert.equal(payload.text, "The catalyst remained stable for 24 h.");
    assert.equal(payload.sourceLanguage, "en");
    assert.equal(payload.targetLanguage, "zh-CN");
  }
  assert.equal(result.results.modelscope.status, "failed");
  assert.equal(result.results.baidu.status, "unconfigured");
  assert.equal(result.results.aliyun.status, "success");
  assert.match(String(result.results.aliyun.elapsedMs), /^\d+$/);
  assert.equal(readConfig().preferredFreeProvider, "modelscope");
  assert.equal(readConfig().defaultTranslationMethod, "free-online");
  assert.equal(readConfig().allowPaidApi, false);
  assert.equal(readConfig().freeProviderBenchmarks.modelscope, undefined);
  assert.equal(readConfig().freeProviderBenchmarks.baidu, undefined);
  assert.equal(readConfig().freeProviderBenchmarks.aliyun.textType, "short");
});
