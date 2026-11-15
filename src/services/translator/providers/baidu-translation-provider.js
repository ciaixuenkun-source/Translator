const crypto = require("crypto");
const { TranslatorError, TranslatorConfigurationError, TranslatorCancelledError } = require("../errors");

const BAIDU_TRANSLATE_URL = "https://fanyi-api.baidu.com/api/trans/vip/translate";

class BaiduTranslationProvider {
  constructor({ appId, secretKey, fetchImpl = fetch, timeoutMs = 15000 } = {}) {
    this.appId = String(appId || "").trim();
    this.secretKey = String(secretKey || "").trim();
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.displayName = "百度翻译";
  }
  isConfigured() { return Boolean(this.appId && this.secretKey); }
  buildRequest(text, sourceLanguage, targetLanguage) {
    const salt = crypto.randomBytes(8).toString("hex");
    const sign = crypto.createHash("md5").update(this.appId + text + salt + this.secretKey).digest("hex");
    const body = new URLSearchParams({ q: text, from: sourceLanguage === "zh-CN" ? "zh" : sourceLanguage, to: targetLanguage === "zh-CN" ? "zh" : targetLanguage, appid: this.appId, salt, sign });
    return body;
  }
  async translate({ text, sourceLanguage = "zh-CN", targetLanguage = "en", signal } = {}) {
    if (!this.isConfigured()) throw new TranslatorConfigurationError("请先配置百度翻译 APP ID 和密钥");
    const controller = new AbortController(); let timedOut = false;
    const abort = () => controller.abort(); signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, this.timeoutMs);
    const startedAt = Date.now();
    try {
      const response = await this.fetchImpl(BAIDU_TRANSLATE_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: this.buildRequest(text, sourceLanguage, targetLanguage).toString(), signal: controller.signal });
      const payload = await response.json();
      if (!response.ok || payload.error_code) {
        const code = String(payload.error_code || response.status);
        const messages = {
          "52001": "百度翻译请求超时",
          "52002": "百度翻译系统错误",
          "52003": "百度翻译未授权，请检查 APP ID 或服务开通状态",
          "54000": "百度翻译请求缺少必要参数",
          "54001": "百度翻译签名错误，请检查 APP ID 和密钥",
          "54003": "百度翻译请求过于频繁",
          "54004": "百度翻译账户余额不足",
          "54005": "百度翻译长文本请求过于频繁",
          "58000": "百度翻译客户端 IP 不在允许范围内",
          "58001": "百度翻译不支持该语言方向",
          "58002": "百度翻译服务已关闭",
          "58003": "百度翻译当前 IP 已被封禁",
          "90107": "百度翻译认证未通过或尚未生效",
          "20003": "百度翻译拒绝了存在安全风险的请求内容"
        };
        const errorCode = ["52003", "54001"].includes(code)
          ? "api-key-invalid"
          : code === "52001"
            ? "request-timeout"
            : ["54003", "54005"].includes(code)
              ? "rate-limited"
              : "provider-error";
        throw new TranslatorError(messages[code] || "百度翻译请求失败", {
          code: errorCode,
          retryable: ["52001", "52002", "54003", "54005"].includes(code),
          details: { providerCode: code }
        });
      }
      const translated = (payload.trans_result || []).map(item => item.dst).join("\n").trim();
      if (!translated) throw new TranslatorError("百度翻译没有返回有效译文", { code: "empty-response", retryable: true });
      return { text: translated, provider: "baidu-translate", providerLabel: "百度翻译", model: "通用翻译 API", responseTimeMs: Date.now() - startedAt };
    } catch (error) {
      if (timedOut) throw new TranslatorError("百度翻译请求超时", { code: "request-timeout", retryable: true });
      if (signal?.aborted || error?.name === "AbortError") throw new TranslatorCancelledError();
      if (error instanceof TranslatorError) throw error;
      throw new TranslatorError("百度翻译网络连接失败", { code: "network-error", retryable: true });
    } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
  }
  testConnection({ signal } = {}) { return this.translate({ text: "你好", sourceLanguage: "zh-CN", targetLanguage: "en", signal }); }
}

module.exports = { BAIDU_TRANSLATE_URL, BaiduTranslationProvider };
