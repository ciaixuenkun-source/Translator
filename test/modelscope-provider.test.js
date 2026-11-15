const test = require("node:test");
const assert = require("node:assert/strict");
const {
  MODELSCOPE_BASE_URL,
  MODELSCOPE_QWEN3_MODEL,
  ModelScopeQwenProvider,
  buildTranslationMessages
} = require("../src/services/translator/providers/modelscope-qwen-provider");
const { safeModelScopeDetails } = require("../src/services/translator/providers/modelscope-qwen-provider");

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

test("builds concise bilingual translation prompts", () => {
  const zh = buildTranslationMessages({
    text: "材料的选择直接影响电池性能。",
    sourceLanguage: "zh-CN",
    targetLanguage: "en"
  });
  const en = buildTranslationMessages({
    text: "The catalyst remained stable for 24 h.",
    sourceLanguage: "en",
    targetLanguage: "zh-CN"
  });
  assert.match(zh[1].content, /Simplified Chinese to English/);
  assert.match(en[1].content, /English to Simplified Chinese/);
  assert.match(en[1].content, /24 h/);
  assert.match(zh[0].content, /only the translation/i);
});

test("uses Ling-3.0-flash through API-Inference and disables thinking with the supported parameter", async () => {
  let requestUrl;
  let requestBody;
  const provider = new ModelScopeQwenProvider({
    apiKey: "fake-token",
    model: "Qwen/Qwen3-8B:DashScope",
    fetchImpl: async (url, options) => {
      requestUrl = url;
      requestBody = JSON.parse(options.body);
      return jsonResponse({ choices: [{ message: { content: "Battery performance depends on material selection." } }] });
    }
  });
  const result = await provider.translate({
    text: "材料的选择直接影响电池性能。",
    sourceLanguage: "zh-CN",
    targetLanguage: "en"
  });
  assert.equal(requestUrl, `${MODELSCOPE_BASE_URL}/chat/completions`);
  assert.equal(requestBody.model, MODELSCOPE_QWEN3_MODEL);
  assert.equal(MODELSCOPE_QWEN3_MODEL, "inclusionAI/Ling-3.0-flash");
  assert.equal(requestBody.stream, false);
  assert.equal(requestBody.chat_template_kwargs.enable_thinking, false);
  assert.equal(Object.hasOwn(requestBody, "enable_thinking"), false);
  assert.equal(Object.hasOwn(requestBody, "extra_body"), false);
  assert.doesNotMatch(requestBody.model, /:/);
  assert.equal(result.provider, "modelscope-ling-3-flash");
});

test("returns only final Ling content and filters reasoning text", async () => {
  const provider = new ModelScopeQwenProvider({
    apiKey: "fake-token",
    fetchImpl: async () => jsonResponse({
      choices: [{ message: {
        reasoning_content: "internal reasoning must stay hidden",
        content: "<think>fallback reasoning</think>The catalyst remained stable for 24 h."
      } }]
    })
  });
  const result = await provider.translate({
    text: "催化剂保持稳定 24 小时。",
    sourceLanguage: "zh-CN",
    targetLanguage: "en"
  });
  assert.equal(result.text, "The catalyst remained stable for 24 h.");
  assert.doesNotMatch(result.text, /reasoning|think/i);
});

test("maps rate limits, missing models, and magic-point exhaustion", async () => {
  for (const [status, payload, code] of [
    [429, { error: { message: "rate limited" } }, "rate-limited"],
    [404, { error: { message: "model not found" } }, "model-unavailable"],
    [400, { error: { message: "魔粒余额不足" } }, "free-quota-exhausted"]
  ]) {
    const provider = new ModelScopeQwenProvider({
      apiKey: "secret-not-in-errors",
      fetchImpl: async () => jsonResponse(payload, status)
    });
    await assert.rejects(
      provider.translate({ text: "hello", sourceLanguage: "en", targetLanguage: "zh-CN" }),
      (error) => {
        assert.equal(error.code, code);
        assert.doesNotMatch(error.message, /secret-not-in-errors/);
        return true;
      }
    );
  }
});

test("classifies timeout without retrying a paid provider", async () => {
  const provider = new ModelScopeQwenProvider({
    apiKey: "fake-token",
    timeoutMs: 1,
    fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    })
  });
  await assert.rejects(
    provider.translate({ text: "hello", sourceLanguage: "en", targetLanguage: "zh-CN" }),
    (error) => error.code === "request-timeout"
  );
});

test("sanitizes ModelScope diagnostics without exposing credentials", () => {
  const details = safeModelScopeDetails(422, {
    error: { code: "invalid_parameter", message: "Authorization: Bearer ms-secret-value is invalid" },
    request_id: "req-123"
  });
  assert.equal(details.httpStatus, 422);
  assert.equal(details.errorCode, "invalid_parameter");
  assert.equal(details.requestId, "req-123");
  assert.equal(details.model, "inclusionAI/Ling-3.0-flash");
  assert.doesNotMatch(JSON.stringify(details), /ms-secret-value|Bearer/i);
});
