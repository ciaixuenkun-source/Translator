const { TranslatorError } = require("../errors");

class PaidPermissionProvider {
  constructor(provider, { isAllowed } = {}) {
    this.provider = provider;
    this.isAllowed = isAllowed || (() => false);
    this.displayName = provider?.displayName || "AI precise translation";
  }

  isConfigured() {
    return Boolean(this.provider?.isConfigured?.());
  }

  async translate(options) {
    if (!this.isAllowed()) {
      throw new TranslatorError("Please enable paid API access in Basic Settings first.", {
        code: "paid-api-disabled"
      });
    }
    return this.provider.translate(options);
  }
}

module.exports = { PaidPermissionProvider };
