const {
  TranslatorError,
  TranslatorConfigurationError,
  TranslatorCancelledError
} = require("../errors");
const {
  chatCompletionsUrl,
  errorFromResponse
} = require("./openai-compatible-provider");

const MODELSCOPE_BASE_URL = "https://api-inference.modelscope.cn/v1";
const MODELSCOPE_QWEN3_MODEL = "inclusionAI/Ling-3.0-flash";
const MODELSCOPE_PROVIDER_LABEL = "魔搭社区 · Ling-3.0-flash";

const LANGUAGE_LABELS = Object.freeze({
  "zh-CN": "Simplified Chinese",
  en: "English"
});

function buildTranslationMessages({ text, sourceLanguage, targetLanguage }) {
  const source = LANGUAGE_LABELS[sourceLanguage] || sourceLanguage;
  const target = LANGUAGE_LABELS[targetLanguage] || targetLanguage;
  return [
    {
      role: "system",
      content:
        "Translate accurately. Return only the translation, without reasoning, notes or quotation marks."
    },
    {
      role: "user",
      content:
        `Translate from ${source} to ${target}. Preserve numbers, units, symbols and names exactly.\n\n${text}`
    }
  ];
}

async function readErrorPayload(response) {
  try { return await response.json(); }
  catch { return null; }
}

function safeModelScopeDetails(status, payload) {
  const rawCode = String(payload?.error?.code || payload?.code || "").slice(0, 80);
  const rawMessage = String(payload?.error?.message || payload?.message || "");
  const requestId = String(
    payload?.request_id || payload?.requestId || payload?.error?.request_id || ""
  ).slice(0, 120);
  return {
    httpStatus: Number(status) || null,
    errorCode: /^[A-Za-z0-9._:-]{1,80}$/.test(rawCode) ? rawCode : "",
    message: rawMessage
      .replace(/(?:Bearer\s+)?(?:ms-|sk-)[A-Za-z0-9._-]+/gi, "[credential removed]")
      .replace(/authorization\s*[:=][^,;\s]+/gi, "authorization=[removed]")
      .replace(/[\r\n\t]+/g, " ")
      .slice(0, 360),
    requestId,
    model: MODELSCOPE_QWEN3_MODEL
  };
}

function modelscopeError(status, payload) {
  const details = safeModelScopeDetails(status, payload);
  const message = String(payload?.error?.message || payload?.message || "");
  if (/魔粒|insufficient.+(?:credit|quota|balance)|quota.+exceed/i.test(message)) {
    return new TranslatorError("魔粒余额不足，请前往魔搭官网查看额度", {
      code: "free-quota-exhausted",
      details
    });
  }
  const error = errorFromResponse(status, payload);
  error.details = details;
  return error;
}

class ModelScopeQwenProvider {
  constructor({
    apiKey,
    baseUrl = MODELSCOPE_BASE_URL,
    model = MODELSCOPE_QWEN3_MODEL,
    timeoutMs = 30000,
    fetchImpl = fetch
  } = {}) {
    this.apiKey = String(apiKey || "").trim();
    this.baseUrl = String(baseUrl || MODELSCOPE_BASE_URL).trim().replace(/\/+$/, "");
    this.model = model === MODELSCOPE_QWEN3_MODEL ? model : MODELSCOPE_QWEN3_MODEL;
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl;
    this.displayName = MODELSCOPE_PROVIDER_LABEL;
  }

  isConfigured() {
    return Boolean(this.apiKey);
  }

  buildRequestBody({ text, sourceLanguage, targetLanguage }) {
    return {
      model: MODELSCOPE_QWEN3_MODEL,
      messages: buildTranslationMessages({ text, sourceLanguage, targetLanguage }),
      stream: false,
      temperature: 0.6,
      top_p: 0.95,
      top_k: 20,
      chat_template_kwargs: { enable_thinking: false }
    };
  }

  async translate({ text, sourceLanguage = "zh-CN", targetLanguage = "en", signal } = {}) {
    if (!this.isConfigured()) {
      throw new TranslatorConfigurationError("请先在设置中配置魔搭社区访问令牌");
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
        body: JSON.stringify(this.buildRequestBody({ text, sourceLanguage, targetLanguage })),
        signal: requestController.signal
      });
      if (!response.ok) {
        throw modelscopeError(response.status, await readErrorPayload(response));
      }
      const payload = await response.json();
      const message = payload?.choices?.[0]?.message || {};
      const translatedText = String(message.content || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
      if (typeof translatedText !== "string" || !translatedText.trim()) {
        throw new TranslatorError("翻译服务没有返回有效译文", {
          code: "empty-response",
          retryable: true
        });
      }
      return {
        text: translatedText.trim(),
        provider: "modelscope-ling-3-flash",
        providerLabel: MODELSCOPE_PROVIDER_LABEL,
        model: MODELSCOPE_QWEN3_MODEL,
        responseTimeMs: Date.now() - startedAt
      };
    } catch (error) {
      if (timedOut) {
        throw new TranslatorError("请求超时", { code: "request-timeout", retryable: true });
      }
      if (signal?.aborted || error?.name === "AbortError") throw new TranslatorCancelledError();
      if (error instanceof TranslatorError) throw error;
      throw new TranslatorError("网络连接失败", { code: "network-error", retryable: true });
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abortRequest);
    }
  }

  testConnection({ signal } = {}) {
    return this.translate({ text: "你好", sourceLanguage: "zh-CN", targetLanguage: "en", signal });
  }
}

module.exports = {
  MODELSCOPE_BASE_URL,
  MODELSCOPE_QWEN3_MODEL,
  MODELSCOPE_PROVIDER_LABEL,
  ModelScopeQwenProvider,
  buildTranslationMessages,
  modelscopeError,
  safeModelScopeDetails
};
