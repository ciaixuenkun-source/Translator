const { TranslatorCancelledError } = require("./errors");

class LocalTranslationQueue {
  constructor() {
    this.tail = Promise.resolve();
    this.pending = 0;
  }

  run(task, signal) {
    this.pending += 1;
    const execute = async () => {
      if (signal?.aborted) throw new TranslatorCancelledError();
      return task();
    };
    const result = this.tail.catch(() => undefined).then(execute);
    this.tail = result.catch(() => undefined).finally(() => {
      this.pending = Math.max(0, this.pending - 1);
    });
    return result;
  }
}

module.exports = { LocalTranslationQueue };
