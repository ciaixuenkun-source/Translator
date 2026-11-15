const {
  TranslatorError,
  TranslatorConfigurationError,
  TranslatorCancelledError
} = require("../errors");
const {
  chatCompletionsUrl,
  errorFromResponse
} = require("./openai-compatible-provider");

const SILICONFLOW_BASE_URL = "https://api.siliconflow.cn/v1";
const SILICONFLOW_HUNYUAN_MT_MODEL = "tencent/Hunyuan-MT-7B";
const SILICONFLOW_PROVIDER_LABEL = "硅基流动 · Hunyuan-MT-7B";

const LANGUAGE_LABELS = Object.freeze({
  "zh-CN": "Simplified Chinese",
  en: "English"
});

function languageLabel(language) {
  return LANGUAGE_LABELS[language] || String(language || "").trim();
}

function buildTranslationMessages({ text, sourceLanguage, targetLanguage }) {
  const source = languageLabel(sourceLanguage);
  const target = languageLabel(targetLanguage);
  return [
    {
      role: "system",
      content:
        "You are Hunyuan-MT, a professional translation engine. " +
        "Translate faithfully and output only the translation."
    },
    {
      role: "user",
      content:
        `Translate the following text from ${source} to ${target}. ` +
        "Keep numbers, units, symbols and proper nouns accurate. " +
        "Do not add explanations.\n\n" +
        text
    }
  ];
}

async function readErrorPayload(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

class SiliconFlowHunyuanProvider {
  constructor({
    apiKey,
    baseUrl = SILICONFLOW_BASE_URL,
    model = SILICONFLOW_HUNYUAN_MT_MODEL,
    timeoutMs = 30000,
    fetchImpl = fetch
  } = {}) {
    this.apiKey = String(apiKey || "").trim();
    this.baseUrl = String(baseUrl || SILICONFLOW_BASE_URL).trim().replace(/\/+$/, "");
    this.model = model === SILICONFLOW_HUNYUAN_MT_MODEL
      ? model
      : SILICONFLOW_HUNYUAN_MT_MODEL;
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl;
    this.displayName = SILICONFLOW_PROVIDER_LABEL;
  }

  isConfigured() {
    return Boolean(this.apiKey);
  }

  buildRequestBody({ text, sourceLanguage, targetLanguage }) {
    return {
      model: SILICONFLOW_HUNYUAN_MT_MODEL,
      messages: buildTranslationMessages({ text, sourceLanguage, targetLanguage }),
      stream: false
    };
  }

  async translate({
    text,
    sourceLanguage = "zh-CN",
    targetLanguage = "en",
    signal
  } = {}) {
    if (!this.isConfigured()) {
      throw new TranslatorConfigurationError("请先在设置中配置免费在线翻译");
    }

    const requestController = new AbortController();
    let timedOut = false;
    const abortRequest = () => requestController.abort();
    signal?.addEventListener("abort", abortRequest, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      requestController.abort();
    }, this.timeoutMs);
    const startedAt = Date.now();

    try {
      const response = await this.fetchImpl(chatCompletionsUrl(this.baseUrl), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(
          this.buildRequestBody({ text, sourceLanguage, targetLanguage })
        ),
        signal: requestController.signal
      });

      if (!response.ok) {
        throw errorFromResponse(response.status, await readErrorPayload(response));
      }

      const payload = await response.json();
      const translatedText = payload?.choices?.[0]?.message?.content || "";
      const responseTimeMs = Date.now() - startedAt;
      if (typeof translatedText !== "string" || !translatedText.trim()) {
        throw new TranslatorError("翻译服务没有返回有效译文", {
          code: "empty-response",
          retryable: true
        });
      }
      return {
        text: translatedText.trim(),
        provider: "siliconflow-hunyuan-mt",
        providerLabel: SILICONFLOW_PROVIDER_LABEL,
        model: SILICONFLOW_HUNYUAN_MT_MODEL,
        responseTimeMs
      };
    } catch (error) {
      if (timedOut) {
        throw new TranslatorError("请求超时", {
          code: "request-timeout",
          retryable: true
        });
      }
      if (signal?.aborted || error?.name === "AbortError") {
        throw new TranslatorCancelledError();
      }
      if (error instanceof TranslatorError) throw error;
      throw new TranslatorError("网络连接失败", {
        code: "network-error",
        retryable: true
      });
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abortRequest);
    }
  }

  testConnection({ signal } = {}) {
    return this.translate({
      text: "你好",
      sourceLanguage: "zh-CN",
      targetLanguage: "en",
      signal
    });
  }
}

module.exports = {
  SILICONFLOW_BASE_URL,
  SILICONFLOW_HUNYUAN_MT_MODEL,
  SILICONFLOW_PROVIDER_LABEL,
  SiliconFlowHunyuanProvider,
  buildTranslationMessages
};
