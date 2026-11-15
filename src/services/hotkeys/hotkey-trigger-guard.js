class HotkeyTriggerGuard {
  constructor({ cooldownMs = 350, now = () => Date.now() } = {}) {
    this.cooldownMs = cooldownMs;
    this.now = now;
    this.lastTriggeredAt = new Map();
    this.running = new Set();
  }

  run(accelerator, callback) {
    const timestamp = this.now();
    const lastTriggeredAt = this.lastTriggeredAt.get(accelerator) ?? -Infinity;
    if (this.running.has(accelerator) || timestamp - lastTriggeredAt < this.cooldownMs) return false;

    this.lastTriggeredAt.set(accelerator, timestamp);
    this.running.add(accelerator);
    try {
      callback();
    } finally {
      this.running.delete(accelerator);
    }
    return true;
  }

  clear() {
    this.lastTriggeredAt.clear();
    this.running.clear();
  }
}

module.exports = { HotkeyTriggerGuard };
