function easeInOutCubic(progress) {
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2;
}

function interpolateBounds(from, to, progress) {
  const eased = easeInOutCubic(Math.min(1, Math.max(0, progress)));
  return {
    x: Math.round(from.x + (to.x - from.x) * eased),
    y: Math.round(from.y + (to.y - from.y) * eased),
    width: Math.round(from.width + (to.width - from.width) * eased),
    height: Math.round(from.height + (to.height - from.height) * eased)
  };
}

function animateWindowBounds(window, target, { duration = 300, onComplete = () => {} } = {}) {
  const start = window.getBounds();
  const startedAt = Date.now();
  let timer = null;
  const step = () => {
    if (!window || window.isDestroyed()) return;
    const progress = Math.min(1, (Date.now() - startedAt) / duration);
    window.setBounds(interpolateBounds(start, target, progress), false);
    if (progress >= 1) {
      timer = null;
      onComplete();
      return;
    }
    timer = setTimeout(step, 16);
  };
  step();
  return () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
}

module.exports = { animateWindowBounds, easeInOutCubic, interpolateBounds };
