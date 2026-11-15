const test = require("node:test");
const assert = require("node:assert/strict");

const presets = require("../src/windows/settings/ai-provider-presets");

test("manual provider and model choices remain last", () => {
  assert.equal(presets.providers.at(-1).id, presets.CUSTOM_PROVIDER_ID);
  for (const provider of presets.providers) {
    assert.equal(provider.models.at(-1).id, presets.CUSTOM_MODEL_ID);
  }
});

test("domestic, international, and custom providers are grouped in order", () => {
  assert.deepEqual(
    presets.providerGroups.map((group) => group.id),
    ["domestic", "international", "other"]
  );
  const ids = presets.providers.map((provider) => provider.id);
  assert.deepEqual(ids, [
    "deepseek",
    "aliyun",
    "zhipu",
    "moonshot",
    "volcengine",
    "siliconflow",
    "openai",
    "google-gemini",
    "xai",
    "mistral",
    "openrouter",
    "groq",
    "together",
    "fireworks",
    presets.CUSTOM_PROVIDER_ID
  ]);
  assert.equal(presets.providers.length, 15);
});

test("known compatible base URLs select their provider", () => {
  assert.equal(presets.identifyProvider("https://api.deepseek.com/").id, "deepseek");
  assert.equal(presets.identifyProvider("https://api.openai.com/v1").id, "openai");
  assert.equal(presets.identifyProvider("https://api.siliconflow.cn/v1/").id, "siliconflow");
  assert.equal(presets.identifyProvider("https://generativelanguage.googleapis.com/v1beta/openai/").id, "google-gemini");
  assert.equal(presets.identifyProvider("https://api.x.ai/v1").id, "xai");
  assert.equal(presets.identifyProvider("https://api.mistral.ai/v1").id, "mistral");
  assert.equal(presets.identifyProvider("https://openrouter.ai/api/v1").id, "openrouter");
  assert.equal(presets.identifyProvider("https://api.groq.com/openai/v1").id, "groq");
  assert.equal(presets.identifyProvider("https://api.together.xyz/v1").id, "together");
  assert.equal(presets.identifyProvider("https://api.fireworks.ai/inference/v1").id, "fireworks");
});

test("unknown saved addresses and models stay custom", () => {
  const provider = presets.identifyProvider("https://private.example.test/v1");
  assert.equal(provider.id, presets.CUSTOM_PROVIDER_ID);
  assert.equal(presets.identifyModel(presets.getProvider("deepseek"), "future-model").id, presets.CUSTOM_MODEL_ID);
});

test("international presets use chat-completions compatible base URLs", () => {
  const urls = Object.fromEntries(presets.providers.map((provider) => [provider.id, provider.baseUrl]));
  assert.equal(`${urls["google-gemini"].replace(/\/+$/, "")}/chat/completions`, "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
  assert.equal(`${urls.xai.replace(/\/+$/, "")}/chat/completions`, "https://api.x.ai/v1/chat/completions");
  assert.equal(`${urls.mistral.replace(/\/+$/, "")}/chat/completions`, "https://api.mistral.ai/v1/chat/completions");
  assert.equal(`${urls.openrouter.replace(/\/+$/, "")}/chat/completions`, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(`${urls.groq.replace(/\/+$/, "")}/chat/completions`, "https://api.groq.com/openai/v1/chat/completions");
  assert.equal(`${urls.together.replace(/\/+$/, "")}/chat/completions`, "https://api.together.xyz/v1/chat/completions");
  assert.equal(`${urls.fireworks.replace(/\/+$/, "")}/chat/completions`, "https://api.fireworks.ai/inference/v1/chat/completions");
});

test("common international model IDs are preserved as API IDs", () => {
  const models = (providerId) => presets.getProvider(providerId).models.map((model) => model.id);
  assert.deepEqual(models("google-gemini"), [
    "gemini-3.8-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.6-flash",
    "gemini-3.1-pro-preview",
    presets.CUSTOM_MODEL_ID
  ]);
  assert.deepEqual(models("xai"), ["grok-4.7", presets.CUSTOM_MODEL_ID]);
  assert.deepEqual(models("mistral"), [
    "mistral-medium-3.5",
    "ministral-3-8b-2512",
    "mistral-small-latest",
    "mistral-large-latest",
    presets.CUSTOM_MODEL_ID
  ]);
  assert.deepEqual(models("openrouter"), ["openai/gpt-5.2", presets.CUSTOM_MODEL_ID]);
  assert.deepEqual(models("groq"), [
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    presets.CUSTOM_MODEL_ID
  ]);
  assert.deepEqual(models("together"), [
    "MiniMaxAI/MiniMax-M3",
    "Qwen/Qwen3.8-Flash",
    "Qwen/Qwen3.6-Plus",
    "moonshotai/Kimi-K3",
    "openai/gpt-oss-120b",
    "deepseek-ai/DeepSeek-V4.1-Flash",
    presets.CUSTOM_MODEL_ID
  ]);
  assert.deepEqual(models("fireworks"), [
    "accounts/fireworks/models/deepseek-v3p1",
    presets.CUSTOM_MODEL_ID
  ]);
});

test("presets contain no credentials and use HTTPS", () => {
  for (const provider of presets.providers.filter((item) => item.id !== presets.CUSTOM_PROVIDER_ID)) {
    assert.match(provider.baseUrl, /^https:\/\//);
    assert.equal(Object.hasOwn(provider, "apiKey"), false);
  }
});
