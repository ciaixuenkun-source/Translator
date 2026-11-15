const test = require("node:test");
const assert = require("node:assert/strict");
const {
  SILICONFLOW_BASE_URL,
  SILICONFLOW_HUNYUAN_MT_MODEL,
  SiliconFlowHunyuanProvider,
  buildTranslationMessages
} = require("../src/services/translator/providers/siliconflow-hunyuan-provider");

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init
  });
}

test("builds concise Hunyuan-MT messages for Chinese to English", () => {
  const messages = buildTranslationMessages({
    text: "材料的选择直接影响电池性能。",
    sourceLanguage: "zh-CN",
    targetLanguage: "en"
  });
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, "system");
  assert.match(messages[0].content, /output only the translation/);
  assert.match(messages[1].content, /Simplified Chinese to English/);
  assert.match(messages[1].content, /材料的选择/);
});

test("builds concise Hunyuan-MT messages for English to Chinese", () => {
  const messages = buildTranslationMessages({
    text: "The catalyst remained stable for 24 h.",
    sourceLanguage: "en",
    targetLanguage: "zh-CN"
  });
  assert.match(messages[1].content, /English to Simplified Chinese/);
  assert.match(messages[1].content, /24 h/);
});

test("uses only the fixed SiliconFlow translation model", async () => {
  let requestedUrl = "";
  let requestedBody;
  const provider = new SiliconFlowHunyuanProvider({
    apiKey: "fake-key",
    model: "paid/model-should-not-be-used",
    fetchImpl: async (url, options) => {
      requestedUrl = url;
      requestedBody = JSON.parse(options.body);
      return jsonResponse({ choices: [{ message: { content: "Translated" } }] });
    }
  });
  const result = await provider.translate({
    text: "中文",
    sourceLanguage: "zh-CN",
    targetLanguage: "en"
  });
  assert.equal(requestedUrl, `${SILICONFLOW_BASE_URL}/chat/completions`);
  assert.equal(requestedBody.model, SILICONFLOW_HUNYUAN_MT_MODEL);
  assert.equal(result.text, "Translated");
  assert.equal(result.model, SILICONFLOW_HUNYUAN_MT_MODEL);
});

test("parses provider errors without leaking the API key", async () => {
  const provider = new SiliconFlowHunyuanProvider({
    apiKey: "secret-should-not-leak",
    fetchImpl: async () => jsonResponse({ error: { message: "bad key" } }, { status: 401 })
  });
  await assert.rejects(
    provider.translate({ text: "hello", sourceLanguage: "en", targetLanguage: "zh-CN" }),
    (error) => {
      assert.equal(error.code, "api-key-invalid");
      assert.doesNotMatch(error.message, /secret-should-not-leak/);
      return true;
    }
  );
});

test("classifies timeout and rate limit failures", async () => {
  const timeoutProvider = new SiliconFlowHunyuanProvider({
    apiKey: "fake-key",
    timeoutMs: 1,
    fetchImpl: (_url, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener(
          "abort",
          () => reject(new DOMException("aborted", "AbortError")),
          { once: true }
        );
      })
  });
  await assert.rejects(
    timeoutProvider.translate({ text: "hello", sourceLanguage: "en", targetLanguage: "zh-CN" }),
    (error) => error.code === "request-timeout"
  );

  const rateLimitProvider = new SiliconFlowHunyuanProvider({
    apiKey: "fake-key",
    fetchImpl: async () => jsonResponse({ error: { message: "rate limited" } }, { status: 429 })
  });
  await assert.rejects(
    rateLimitProvider.translate({ text: "hello", sourceLanguage: "en", targetLanguage: "zh-CN" }),
    (error) => error.code === "rate-limited"
  );
});
