const crypto = require("crypto");
const { cleanText } = require("./spatial-text");

const GAME_KEY_TOKEN = /^(?:esc|enter|space|shift|ctrl|control|alt|tab|backspace|delete|home|end|pgup|pgdn|up|down|left|right|l[1-3]|r[1-3]|f(?:[1-9]|1[0-2])|wasd)$/i;

function normalizeTargetLanguage(value) {
  return String(value || "").toLowerCase().startsWith("en") ? "en" : "zh-CN";
}

function scriptProfile(value) {
  const text = cleanText(value);
  return {
    text,
    han: (text.match(/[\u3400-\u4dbf\u4e00-\u9fff]/g) || []).length,
    latin: (text.match(/[A-Za-z]/g) || []).length,
    kana: (text.match(/[\u3040-\u30ff]/g) || []).length,
    hangul: (text.match(/[\uac00-\ud7af]/g) || []).length
  };
}

function hasNaturalEnglish(profile) {
  if (profile.latin < 2) return false;
  const lettersOnly = profile.text.replace(/[^A-Za-z0-9]/g, "");
  return !GAME_KEY_TOKEN.test(lettersOnly);
}

function decideGameTranslation(value, targetLanguage) {
  const profile = scriptProfile(value);
  const target = normalizeTargetLanguage(targetLanguage);
  if (!profile.text || (!profile.han && !profile.latin && !profile.kana && !profile.hangul)) {
    return { action: "skip", reason: "non-language", text: profile.text, targetLanguage: target };
  }
  if (profile.kana || profile.hangul) {
    return { action: "skip", reason: "uncertain-language", text: profile.text, targetLanguage: target };
  }
  const english = hasNaturalEnglish(profile);
  if (profile.han && english) {
    return { action: "translate", reason: "mixed", text: profile.text, targetLanguage: target };
  }
  if (target === "zh-CN") {
    return english
      ? { action: "translate", reason: "source-english", text: profile.text, targetLanguage: target }
      : { action: "skip", reason: "already-target", text: profile.text, targetLanguage: target };
  }
  return profile.han
    ? { action: "translate", reason: "source-chinese", text: profile.text, targetLanguage: target }
    : { action: "skip", reason: english ? "already-target" : "non-language", text: profile.text, targetLanguage: target };
}

function gameTextKey(decision) {
  return crypto.createHash("sha1").update(`${decision.targetLanguage}\n${decision.text}`).digest("hex");
}

function filterSpatialRegionsForTarget(regions, targetLanguage) {
  return (regions || []).map((region) => ({
    ...region,
    decision: decideGameTranslation(region?.text, targetLanguage)
  })).filter((region) => region.decision.action === "translate").map((region) => ({
    ...region,
    text: region.decision.text
  }));
}

async function resolveGameText({ sourceText, targetLanguage, lastKey, lastResult, translate }) {
  const decision = decideGameTranslation(sourceText, targetLanguage);
  const contentKey = gameTextKey(decision);
  if (contentKey === lastKey && lastResult) return { ...lastResult, contentKey, cached: true };
  if (decision.action !== "translate") {
    return { sourceText: decision.text, translatedText: "", contentKey, clearOverlay: true, skipReason: decision.reason };
  }
  const translatedText = await translate(decision.text, decision.targetLanguage);
  return { sourceText: decision.text, translatedText, contentKey, clearOverlay: false };
}

module.exports = {
  decideGameTranslation,
  filterSpatialRegionsForTarget,
  gameTextKey,
  normalizeTargetLanguage,
  resolveGameText,
  scriptProfile
};
