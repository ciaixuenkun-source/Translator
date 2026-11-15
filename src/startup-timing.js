function createStartupTiming({
  enabled = process.env.TRANSLATOR_STARTUP_TIMING === "1",
  now = () => Date.now(),
  log = console.info
} = {}) {
  const startedAt = now();
  let lastAt = startedAt;

  function mark(label) {
    if (!enabled) return null;
    const current = now();
    const entry = {
      label,
      totalMs: current - startedAt,
      stepMs: current - lastAt
    };
    lastAt = current;
    log("[startup-timing]", entry);
    return entry;
  }

  return { mark };
}

module.exports = { createStartupTiming };
