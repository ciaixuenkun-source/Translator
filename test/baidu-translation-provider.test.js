const test = require("node:test");
const assert = require("node:assert/strict");
const {
  BAIDU_TRANSLATE_URL,
  BaiduTranslationProvider
} = require("../src/services/translator/providers/baidu-translation-provider");
const {
  API_KEY_CREDENTIAL,
  BAIDU_APP_ID_CREDENTIAL,
  BAIDU_SECRET_CREDENTIAL,
  SILICONFLOW_API_KEY_CREDENTIAL,
  TranslatorSettingsService
} = require("../src/services/translator/translator-settings-service");
const { AutomaticTranslationProvider } = require("../src/services/translator/automatic-translation-provider");

function response(payload, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => payload };
}

test("Baidu uses the official general-text endpoint and signs the unencoded UTF-8 query", async () => {
  let requestedUrl;
  let body;
  const provider = new BaiduTranslationProvider({
    appId: "test-app-id",
    secretKey: "test-secret",
    fetchImpl: async (url, options) => {
      requestedUrl = url;
      body = options.body;
      return response({ trans_result: [{ dst: "Translation" }] });
    }
  });
  const result = await provider.translate({
    text: "中文 text + symbols",
    sourceLanguage: "zh-CN",
    targetLanguage: "en"
  });
  const params = new URLSearchParams(body);
  const expectedSign = require("crypto").createHash("md5")
    .update(`test-app-id${params.get("q")}${params.get("salt")}test-secret`)
    .digest("hex");
  assert.equal(requestedUrl, BAIDU_TRANSLATE_URL);
  assert.equal(params.get("q"), "中文 text + symbols");
  assert.equal(params.get("from"), "zh");
  assert.equal(params.get("to"), "en");
  assert.equal(params.get("sign"), expectedSign);
  assert.equal(result.text, "Translation");
  assert.doesNotMatch(body, /test-secret/);
});

test("Baidu joins multi-segment responses and supports English to Chinese", async () => {
  let body;
  const provider = new BaiduTranslationProvider({
    appId: "app",
    secretKey: "secret",
    fetchImpl: async (_url, options) => {
      body = options.body;
      return response({ trans_result: [{ dst: "第一段" }, { dst: "第二段" }] });
    }
  });
  const result = await provider.translate({
    text: "First paragraph.\nSecond paragraph.",
    sourceLanguage: "en",
    targetLanguage: "zh-CN"
  });
  const params = new URLSearchParams(body);
  assert.equal(params.get("from"), "en");
  assert.equal(params.get("to"), "zh");
  assert.equal(result.text, "第一段\n第二段");
});

test("Baidu classifies documented authentication, timeout, rate-limit and policy errors", async () => {
  for (const [providerCode, expectedCode, retryable, message] of [
    ["52001", "request-timeout", true, /请求超时/],
    ["52002", "provider-error", true, /系统错误/],
    ["52003", "api-key-invalid", false, /未授权/],
    ["54001", "api-key-invalid", false, /签名错误/],
    ["54003", "rate-limited", true, /过于频繁/],
    ["54005", "rate-limited", true, /长文本/],
    ["58000", "provider-error", false, /客户端 IP/],
    ["58001", "provider-error", false, /语言方向/],
    ["58002", "provider-error", false, /服务已关闭/]
  ]) {
    const provider = new BaiduTranslationProvider({
      appId: "app",
      secretKey: "secret-that-must-not-escape",
      fetchImpl: async () => response({ error_code: providerCode, error_msg: "unsafe provider text" })
    });
    await assert.rejects(provider.translate({ text: "test" }), (error) => {
      assert.equal(error.code, expectedCode);
      assert.equal(error.retryable, retryable);
      assert.match(error.message, message);
      assert.equal(error.details.providerCode, providerCode);
      assert.doesNotMatch(JSON.stringify(error), /secret-that-must-not-escape|unsafe provider text/);
      return true;
    });
  }
});

test("Baidu handles missing configuration, network errors, empty responses, timeout and cancellation", async () => {
  await assert.rejects(
    new BaiduTranslationProvider().translate({ text: "test" }),
    (error) => error.code === "provider-not-configured"
  );
  await assert.rejects(
    new BaiduTranslationProvider({ appId: "app", secretKey: "secret", fetchImpl: async () => { throw new Error("offline"); } }).translate({ text: "test" }),
    (error) => error.code === "network-error" && error.retryable
  );
  await assert.rejects(
    new BaiduTranslationProvider({ appId: "app", secretKey: "secret", fetchImpl: async () => response({ trans_result: [] }) }).translate({ text: "test" }),
    (error) => error.code === "empty-response" && error.retryable
  );

  const timeoutProvider = new BaiduTranslationProvider({
    appId: "app",
    secretKey: "secret",
    timeoutMs: 1,
    fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    })
  });
  await assert.rejects(timeoutProvider.translate({ text: "test" }), (error) => error.code === "request-timeout");

  const controller = new AbortController();
  const cancelledProvider = new BaiduTranslationProvider({
    appId: "app",
    secretKey: "secret",
    fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
      controller.abort();
    })
  });
  await assert.rejects(
    cancelledProvider.translate({ text: "test", signal: controller.signal }),
    (error) => error.code === "translation-cancelled"
  );
});

test("Baidu credentials save independently and never enter the ordinary config or returned snapshot", () => {
  let config = {
    mode: "free",
    preferFree: true,
    provider: "openai-compatible",
    baseUrl: "",
    model: "",
    timeoutMs: 30000,
    defaultTranslationMethod: "free-online",
    allowPaidApi: false,
    preferredFreeProvider: "baidu",
    freeProviderBenchmarks: {}
  };
  const credentials = {
    [API_KEY_CREDENTIAL]: "paid-api-key",
    [SILICONFLOW_API_KEY_CREDENTIAL]: "siliconflow-key"
  };
  const credentialStore = {
    get: (key) => credentials[key] || null,
    has: (key) => Boolean(credentials[key]),
    set: (key, value) => { credentials[key] = value; }
  };
  const service = new TranslatorSettingsService({ setProviders() {}, setDefaultMode() {} }, {
    configStore: {
      read: () => structuredClone(config),
      write: (next) => { config = structuredClone(next); }
    },
    credentialStore,
    freeProvider: { isConfigured: () => true }
  });
  const result = service.saveFreeProvider("baidu", {
    appId: "baidu-app-id",
    secretKey: "baidu-secret"
  });
  assert.equal(result.ok, true);
  assert.equal(credentials[BAIDU_APP_ID_CREDENTIAL], "baidu-app-id");
  assert.equal(credentials[BAIDU_SECRET_CREDENTIAL], "baidu-secret");
  assert.equal(credentials[API_KEY_CREDENTIAL], "paid-api-key");
  assert.equal(credentials[SILICONFLOW_API_KEY_CREDENTIAL], "siliconflow-key");
  assert.doesNotMatch(JSON.stringify(config), /baidu-app-id|baidu-secret/);
  assert.doesNotMatch(JSON.stringify(result), /baidu-app-id|baidu-secret/);
});

test("Baidu can be preferred in ABC fallback without changing the existing route", async () => {
  const calls = [];
  const provider = (id, fail = false) => ({
    isConfigured: () => true,
    translate: async () => {
      calls.push(id);
      if (fail) throw Object.assign(new Error(`${id} failed`), { code: "network-error", retryable: true });
      return { text: id, provider: id };
    }
  });
  const config = {
    defaultTranslationMethod: "free-online",
    allowPaidApi: false,
    preferredFreeProvider: "baidu"
  };
  const providers = {
    baidu: provider("baidu", true),
    siliconflow: provider("siliconflow"),
    modelscope: provider("modelscope"),
    aliyun: provider("aliyun"),
    ai: provider("ai"),
    local: provider("local")
  };
  const automatic = new AutomaticTranslationProvider({
    configProvider: () => config,
    routeForConfig: (value) => TranslatorSettingsService.prototype.automaticRoute(value, providers)
  });
  const result = await automatic.translate({ text: "test" });
  assert.equal(result.provider, "siliconflow");
  assert.deepEqual(calls, ["baidu", "siliconflow"]);
});

test("Baidu benchmark is isolated and preserves preferred and automatic settings", async () => {
  const calls = [];
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
    freeProviderBenchmarks: {}
  };
  const service = Object.create(TranslatorSettingsService.prototype);
  service.configStore = {
    read: () => structuredClone(config),
    write: (next) => { config = structuredClone(next); }
  };
  service.buildFreeProvider = (id) => ({
    displayName: id,
    isConfigured: () => id === "baidu",
    translate: async (payload) => {
      calls.push({ id, payload });
      return { text: "译文", provider: "baidu-translate", providerLabel: "百度翻译" };
    }
  });
  const result = await service.benchmarkFreeProviders({
    text: "The catalyst remained stable for 24 h.",
    sourceLanguage: "en",
    targetLanguage: "zh-CN",
    textType: "custom"
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls.map(({ id }) => id), ["baidu"]);
  assert.equal(calls[0].payload.sourceLanguage, "en");
  assert.equal(calls[0].payload.targetLanguage, "zh-CN");
  assert.equal(result.results.baidu.status, "success");
  assert.equal(result.results.siliconflow.status, "unconfigured");
  assert.equal(config.preferredFreeProvider, "modelscope");
  assert.equal(config.defaultTranslationMethod, "free-online");
  assert.equal(config.allowPaidApi, false);
  assert.equal(config.freeProviderBenchmarks.baidu.textType, "custom");
});
