const { TranslatorError } = require("./errors");

function comparableText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function isSubstantialNaturalText(text) {
  const normalized = comparableText(text);
  if (normalized.length < 20) return false;
  if (/^(https?:\/\/|www\.)/i.test(normalized)) return false;
  const letters = (normalized.match(/[A-Za-z\u3400-\u9fff]/g) || []).length;
  const words = normalized.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) || [];
  return letters >= 12 && (words.length >= 4 || /[\u3400-\u9fff]{6}/.test(normalized));
}

function assertMeaningfulTranslation(source, translated, { sourceLanguage, targetLanguage } = {}) {
  if (!sourceLanguage || !targetLanguage || sourceLanguage === targetLanguage) return;
  if (!isSubstantialNaturalText(source)) return;
  if (comparableText(source) !== comparableText(translated)) return;
  throw new TranslatorError("翻译服务返回了未翻译的原文", {
    code: "unchanged-response",
    retryable: false
  });
}

module.exports = { comparableText, isSubstantialNaturalText, assertMeaningfulTranslation };
