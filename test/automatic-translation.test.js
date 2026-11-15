const test = require("node:test");
const assert = require("node:assert/strict");
const { AutomaticTranslationProvider } = require("../src/services/translator/automatic-translation-provider");
const { TranslatorSettingsService } = require("../src/services/translator/translator-settings-service");

function provider(id, { configured = true, fail = false, calls = [] } = {}) {
  return {
    isConfigured: () => configured,
    async translate() {
      calls.push(id);
      if (fail) { const error = new Error(`${id} failed`); error.code = "network-error"; error.retryable = true; throw error; }
      return { text: id, provider: id };
    }
  };
}

function route(config, providers) {
  return TranslatorSettingsService.prototype.automaticRoute(config, providers);
}

test("automatic free route tries preferred free, other free, paid, then local", async () => {
  const calls = [];
  const config = { defaultTranslationMethod: "free-online", allowPaidApi: true, preferredFreeProvider: "modelscope" };
  const providers = {
    modelscope: provider("modelscope", { fail: true, calls }),
    siliconflow: provider("siliconflow", { fail: true, calls }),
    ai: provider("ai", { fail: true, calls }),
    local: provider("local", { calls })
  };
  const automatic = new AutomaticTranslationProvider({ configProvider: () => config, routeForConfig: (value) => route(value, providers) });
  assert.equal((await automatic.translate({})).text, "local");
  assert.deepEqual(calls, ["modelscope", "siliconflow", "ai", "local"]);
});

test("paid API is skipped when permission is disabled", async () => {
  const calls = [];
  const config = { defaultTranslationMethod: "free-online", allowPaidApi: false, preferredFreeProvider: "siliconflow" };
  const providers = {
    siliconflow: provider("siliconflow", { fail: true, calls }),
    modelscope: provider("modelscope", { configured: false, calls }),
    ai: provider("ai", { calls }), local: provider("local", { calls })
  };
  const automatic = new AutomaticTranslationProvider({ configProvider: () => config, routeForConfig: (value) => route(value, providers) });
  assert.equal((await automatic.translate({})).text, "local");
  assert.deepEqual(calls, ["siliconflow", "local"]);
});

test("AI default falls back to local and local default never calls online", async () => {
  const providers = { siliconflow: provider("siliconflow"), modelscope: provider("modelscope"), ai: provider("ai"), local: provider("local") };
  assert.deepEqual(route({ defaultTranslationMethod: "ai-api", allowPaidApi: true }, providers).map(x => x.id), ["ai-api", "local"]);
  assert.deepEqual(route({ defaultTranslationMethod: "ai-api", allowPaidApi: false }, providers).map(x => x.id), ["local"]);
  assert.deepEqual(route({ defaultTranslationMethod: "local", allowPaidApi: true }, providers).map(x => x.id), ["local"]);
});

test("cancellation stops fallback providers", async () => {
  const calls = [];
  const controller = new AbortController();
  const first = { isConfigured: () => true, async translate() { calls.push("first"); controller.abort(); const error = new Error("cancel"); error.name = "AbortError"; throw error; } };
  const automatic = new AutomaticTranslationProvider({ configProvider: () => ({}), routeForConfig: () => [{ provider: first }, { provider: provider("second", { calls }) }] });
  await assert.rejects(automatic.translate({ signal: controller.signal }), error => error.code === "translation-cancelled");
  assert.deepEqual(calls, ["first"]);
});

test("unchanged natural-language result falls through to the next provider", async () => {
  const text = "This is a substantial English sentence that should be translated into Chinese.";
  const calls = [];
  const unchanged = { isConfigured: () => true, displayName: "unchanged", async translate() { calls.push("unchanged"); return { text }; } };
  const translated = { isConfigured: () => true, displayName: "translated", async translate() { calls.push("translated"); return { text: "这是一段已经翻译的中文。", providerLabel: "备用服务" }; } };
  const automatic = new AutomaticTranslationProvider({ configProvider: () => ({}), routeForConfig: () => [{ provider: unchanged }, { provider: translated }] });
  const result = await automatic.translate({ text, sourceLanguage: "en", targetLanguage: "zh-CN" });
  assert.equal(result.providerLabel, "备用服务");
  assert.deepEqual(calls, ["unchanged", "translated"]);
});
