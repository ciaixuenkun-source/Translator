const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ALIYUN_API_VERSION,
  ALIYUN_TRANSLATE_URL,
  AliyunTranslationProvider
} = require("../src/services/translator/providers/aliyun-translation-provider");
const {
  ALIYUN_ACCESS_KEY_ID_CREDENTIAL,
  ALIYUN_ACCESS_KEY_SECRET_CREDENTIAL,
  SILICONFLOW_API_KEY_CREDENTIAL,
  TranslatorSettingsService
} = require("../src/services/translator/translator-settings-service");

function response(payload, { ok = true, status = 200 } = {}) {
  return new Response(typeof payload === "string" ? payload : JSON.stringify(payload), {
    status,
    headers: { "Content-Type": typeof payload === "string" ? "application/xml" : "application/json" }
  });
}

test("Aliyun accepts the official numeric success code and uses API version 2018-10-12", async () => {
  let url;
  let body;
  const provider = new AliyunTranslationProvider({
    accessKeyId: "test-id",
    accessKeySecret: "test-secret",
    fetchImpl: async (requestedUrl, options) => {
      url = requestedUrl;
      body = options.body;
      return response({ Code: 200, Message: "success", RequestId: "req-success", Data: { Translated: "Hello, world." } });
    }
  });
  const result = await provider.translate({ text: "你好，世界。", sourceLanguage: "zh-CN", targetLanguage: "en" });
  const params = new URLSearchParams(body);
  assert.equal(url, ALIYUN_TRANSLATE_URL);
  assert.equal(ALIYUN_API_VERSION, "2018-10-12");
  assert.equal(params.get("Version"), ALIYUN_API_VERSION);
  assert.equal(params.get("Action"), "TranslateGeneral");
  assert.equal(params.get("FormatType"), "text");
  assert.equal(params.get("Scene"), "general");
  assert.equal(params.get("SourceLanguage"), "zh");
  assert.equal(params.get("TargetLanguage"), "en");
  assert.equal(params.get("SourceText"), "你好，世界。");
  assert.match(params.get("Signature"), /^[A-Za-z0-9+/]+={0,2}$/);
  assert.equal(body.includes("test-secret"), false);
  assert.equal(result.text, "Hello, world.");
});

test("Aliyun supports English to Chinese and wrapped RPC responses", async () => {
  let body;
  const provider = new AliyunTranslationProvider({
    accessKeyId: "id",
    accessKeySecret: "secret",
    fetchImpl: async (_url, options) => {
      body = options.body;
      return response({ TranslateGeneralResponse: { Code: "200", RequestId: "req", Data: { Translated: "你好，世界。" } } });
    }
  });
  const result = await provider.translate({ text: "Hello, world.", sourceLanguage: "en", targetLanguage: "zh-CN" });
  const params = new URLSearchParams(body);
  assert.equal(params.get("SourceLanguage"), "en");
  assert.equal(params.get("TargetLanguage"), "zh");
  assert.equal(result.text, "你好，世界。");
});

test("Aliyun preserves sanitized JSON diagnostics for the settings detail panel", async () => {
  const provider = new AliyunTranslationProvider({
    accessKeyId: "private-id",
    accessKeySecret: "private-secret",
    fetchImpl: async () => response({
      Code: "Forbidden.RAM",
      Message: "AccessKeyId=private-id has NoPermission; Signature=private-secret",
      RequestId: "req-json"
    }, { ok: false, status: 403 })
  });
  await assert.rejects(provider.translate({ text: "test" }), (error) => {
    assert.equal(error.code, "provider-error");
    assert.equal(error.details.httpStatus, 403);
    assert.equal(error.details.errorCode, "Forbidden.RAM");
    assert.equal(error.details.requestId, "req-json");
    assert.equal(error.details.model, "通用版");
    assert.match(error.details.message, /\[removed\]/);
    assert.doesNotMatch(JSON.stringify(error.details), /private-id|private-secret/);
    return true;
  });
});

test("Aliyun parses XML authentication errors instead of reporting a network failure", async () => {
  const provider = new AliyunTranslationProvider({
    accessKeyId: "id",
    accessKeySecret: "secret",
    fetchImpl: async () => response(
      "<Error><Code>SignatureDoesNotMatch</Code><Message>signature invalid</Message><RequestId>req-xml</RequestId></Error>",
      { ok: false, status: 400 }
    )
  });
  await assert.rejects(provider.translate({ text: "test" }), (error) => {
    assert.equal(error.code, "api-key-invalid");
    assert.equal(error.details.httpStatus, 400);
    assert.equal(error.details.errorCode, "SignatureDoesNotMatch");
    assert.equal(error.details.message, "signature invalid");
    assert.equal(error.details.requestId, "req-xml");
    return true;
  });
});

test("Aliyun handles missing configuration, network errors, empty responses, timeout and cancellation", async () => {
  await assert.rejects(new AliyunTranslationProvider().translate({ text: "test" }), (error) => error.code === "provider-not-configured");
  await assert.rejects(
    new AliyunTranslationProvider({ accessKeyId: "id", accessKeySecret: "secret", fetchImpl: async () => { throw new Error("offline"); } }).translate({ text: "test" }),
    (error) => error.code === "network-error" && error.retryable
  );
  await assert.rejects(
    new AliyunTranslationProvider({ accessKeyId: "id", accessKeySecret: "secret", fetchImpl: async () => response({ Code: 200, Data: {} }) }).translate({ text: "test" }),
    (error) => error.code === "empty-response" && error.retryable
  );
  const timeoutProvider = new AliyunTranslationProvider({
    accessKeyId: "id", accessKeySecret: "secret", timeoutMs: 1,
    fetchImpl: (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true }))
  });
  await assert.rejects(timeoutProvider.translate({ text: "test" }), (error) => error.code === "request-timeout");

  const controller = new AbortController();
  const cancelledProvider = new AliyunTranslationProvider({
    accessKeyId: "id", accessKeySecret: "secret",
    fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
      controller.abort();
    })
  });
  await assert.rejects(cancelledProvider.translate({ text: "test", signal: controller.signal }), (error) => error.code === "translation-cancelled");
});

test("Aliyun credentials remain separate from ordinary configuration and other providers", () => {
  let config = {
    mode: "free", preferFree: true, provider: "openai-compatible", baseUrl: "", model: "", timeoutMs: 30000,
    defaultTranslationMethod: "free-online", allowPaidApi: false, preferredFreeProvider: "aliyun", freeProviderBenchmarks: {}
  };
  const credentials = { [SILICONFLOW_API_KEY_CREDENTIAL]: "siliconflow-key" };
  const service = new TranslatorSettingsService({ setProviders() {}, setDefaultMode() {} }, {
    configStore: { read: () => structuredClone(config), write: (next) => { config = structuredClone(next); } },
    credentialStore: {
      get: (key) => credentials[key] || null,
      has: (key) => Boolean(credentials[key]),
      set: (key, value) => { credentials[key] = value; }
    },
    freeProvider: { isConfigured: () => true }
  });
  const result = service.saveFreeProvider("aliyun", { accessKeyId: "aliyun-id", accessKeySecret: "aliyun-secret" });
  assert.equal(result.ok, true);
  assert.equal(credentials[ALIYUN_ACCESS_KEY_ID_CREDENTIAL], "aliyun-id");
  assert.equal(credentials[ALIYUN_ACCESS_KEY_SECRET_CREDENTIAL], "aliyun-secret");
  assert.equal(credentials[SILICONFLOW_API_KEY_CREDENTIAL], "siliconflow-key");
  assert.doesNotMatch(JSON.stringify(config), /aliyun-id|aliyun-secret/);
  assert.doesNotMatch(JSON.stringify(result), /aliyun-id|aliyun-secret/);
});
