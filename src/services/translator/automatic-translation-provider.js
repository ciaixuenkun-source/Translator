const { TranslatorCancelledError, TranslatorError } = require("./errors");
const { assertMeaningfulTranslation } = require("./translation-result-validation");

class AutomaticTranslationProvider {
  constructor({ routeForConfig, configProvider }) {
    this.routeForConfig = routeForConfig;
    this.configProvider = configProvider;
    this.displayName = "Automatic translation";
  }

  isConfigured() {
    return true;
  }

  async translate(options) {
    const route = this.routeForConfig(this.configProvider());
    let lastError = null;
    for (const entry of route) {
      if (options.signal?.aborted) throw new TranslatorCancelledError();
      if (!entry.provider?.isConfigured?.()) continue;
      try {
        const result = await entry.provider.translate(options);
        const translatedText = typeof result === "string" ? result : result?.text;
        assertMeaningfulTranslation(options.text, translatedText, options);
        return result;
      } catch (error) {
        if (options.signal?.aborted || error?.code === "translation-cancelled") {
          throw new TranslatorCancelledError();
        }
        lastError = error;
      }
    }
    if (lastError) {
      lastError.retryable = false;
      throw lastError;
    }
    throw new TranslatorError("No configured translation service is available", {
      code: "provider-not-configured"
    });
  }
}

module.exports = { AutomaticTranslationProvider };
