const MIN_PREVIEW_HEIGHT = 300;
const MAX_PREVIEW_HEIGHT = 640;

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function estimateVisualLines(text, charactersPerLine = 46) {
  const lines = String(text || "").split(/\r?\n/);
  return Math.max(1, lines.reduce((total, line) => (
    total + Math.max(1, Math.ceil(line.length / charactersPerLine))
  ), 0));
}

function calculatePreviewHeight({
  sourceText,
  translatedText,
  warningVisible = false,
  captureExpanded = false,
  workAreaHeight
}) {
  const sourceHeight = clamp(estimateVisualLines(sourceText) * 24 + 12, 42, 190);
  const translationHeight = clamp(
    estimateVisualLines(translatedText) * 24 + 12,
    42,
    190
  );
  const fixedHeight = 185 + (warningVisible ? 30 : 0) + (captureExpanded ? 110 : 0);
  const maximum = Math.min(
    MAX_PREVIEW_HEIGHT,
    Math.max(MIN_PREVIEW_HEIGHT, Math.floor(workAreaHeight - 24))
  );
  return clamp(fixedHeight + sourceHeight + translationHeight, MIN_PREVIEW_HEIGHT, maximum);
}

module.exports = {
  MAX_PREVIEW_HEIGHT,
  MIN_PREVIEW_HEIGHT,
  calculatePreviewHeight,
  estimateVisualLines
};
