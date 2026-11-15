const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  LanguagePreferencesStore
} = require("../src/windows/local-translate/language-preferences-store");
const { modeForSceneMethod } = require("../src/services/translator/scene-translation-method");
const {
  AUTO_MODE,
  FREE_MODE,
  AI_PRECISE_MODE,
  LOCAL_MODE
} = require("../src/services/translator/translation-modes");
const {
  assertMeaningfulTranslation
} = require("../src/services/translator/translation-result-validation");

const projectRoot = path.resolve(__dirname, "..");
const readSource = relativePath => fs.readFileSync(path.join(projectRoot, relativePath), "utf8");

test("ordinary shortcuts and game scenes persist independent methods without changing directions", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "translator-scene-methods-"));
  const file = path.join(directory, "languages.json");
  try {
    const store = new LanguagePreferencesStore(file);
    store.write("normal", { sourceLanguage: "en", targetLanguage: "zh-CN" });
    store.writeMethod("normalAlt1", "free-online");
    store.writeMethod("normalAlt2", "local");
    store.writeMethod("normalAlt3", "ai-api");
    store.writeMethod("game", "local");
    store.writeMethod("gameFullscreen", "ai-api");
    store.writeMethod("gameRegion", "follow-default");
    const saved = store.readAll();
    assert.deepEqual(saved.normal, { sourceLanguage: "en", targetLanguage: "zh-CN" });
    assert.equal(saved.normalAlt1Method, "free-online");
    assert.equal(saved.normalAlt2Method, "local");
    assert.equal(saved.normalAlt3Method, "ai-api");
    assert.equal(saved.gameMethod, "local");
    assert.equal(saved.gameFullscreenMethod, "ai-api");
    assert.equal(saved.gameRegionMethod, "follow-default");
    const restarted = new LanguagePreferencesStore(file);
    assert.equal(restarted.readMethod("normalAlt1"), "free-online");
    assert.equal(restarted.readMethod("normalAlt2"), "local");
    assert.equal(restarted.readMethod("normalAlt3"), "ai-api");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("ordinary translation features persist independent language directions", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "translator-ordinary-directions-"));
  const file = path.join(directory, "languages.json");
  try {
    const store = new LanguagePreferencesStore(file);
    store.write("normalAlt1", { sourceLanguage: "zh-CN", targetLanguage: "en" });
    store.write("normalAlt2", { sourceLanguage: "en", targetLanguage: "zh-CN" });
    store.write("normalAlt3", { sourceLanguage: "zh-CN", targetLanguage: "en" });
    const restarted = new LanguagePreferencesStore(file);
    assert.deepEqual(restarted.read("normalAlt1"), { sourceLanguage: "zh-CN", targetLanguage: "en" });
    assert.deepEqual(restarted.read("normalAlt2"), { sourceLanguage: "en", targetLanguage: "zh-CN" });
    assert.deepEqual(restarted.read("normalAlt3"), { sourceLanguage: "zh-CN", targetLanguage: "en" });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("legacy language preferences receive compatible follow-default methods", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "translator-scene-legacy-"));
  const file = path.join(directory, "languages.json");
  try {
    fs.writeFileSync(file, JSON.stringify({ normal: { sourceLanguage: "en", targetLanguage: "zh-CN" } }));
    const snapshot = new LanguagePreferencesStore(file).readAll();
    assert.equal(snapshot.normalMethod, "follow-default");
    assert.equal(snapshot.normalAlt1Method, "follow-default");
    assert.equal(snapshot.normalAlt2Method, "follow-default");
    assert.equal(snapshot.normalAlt3Method, "follow-default");
    assert.equal(snapshot.gameMethod, "follow-default");
    assert.deepEqual(snapshot.normal, { sourceLanguage: "en", targetLanguage: "zh-CN" });
    assert.deepEqual(snapshot.normalAlt1, snapshot.normal);
    assert.deepEqual(snapshot.normalAlt2, snapshot.normal);
    assert.deepEqual(snapshot.normalAlt3, snapshot.normal);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("legacy daily method is inherited by all three ordinary shortcuts", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "translator-scene-daily-legacy-"));
  const file = path.join(directory, "languages.json");
  try {
    fs.writeFileSync(file, JSON.stringify({ normalMethod: "free-online" }));
    const store = new LanguagePreferencesStore(file);
    assert.equal(store.readMethod("normalAlt1"), "free-online");
    assert.equal(store.readMethod("normalAlt2"), "free-online");
    assert.equal(store.readMethod("normalAlt3"), "free-online");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("scene methods map to distinct runtime modes", () => {
  assert.equal(modeForSceneMethod("follow-default"), AUTO_MODE);
  assert.equal(modeForSceneMethod("free-online"), FREE_MODE);
  assert.equal(modeForSceneMethod("ai-api"), AI_PRECISE_MODE);
  assert.equal(modeForSceneMethod("local"), LOCAL_MODE);
});

test("ordinary Alt+1, Alt+2 and Alt+3 read their own configured methods", () => {
  const main = readSource("src/main.js");
  const alt1Controller = readSource("src/windows/translation-window-controller.js");
  const alt3Controller = readSource("src/windows/local-translate/local-translation-window-controller.js");
  const regionController = readSource("src/services/region-capture/region-capture-controller.js");
  assert.match(alt1Controller, /readMethod\("normalAlt1"\)/);
  assert.match(main, /regionCapture\?\.start\(\{[\s\S]*readMethod\("normalAlt2"\)[\s\S]*languagePreferences\?\.read\("normalAlt2"\)/);
  assert.match(alt3Controller, /readMethod\(record\.mode === "game" \? "game" : "normalAlt3"\)/);
  assert.match(regionController, /translationMode: modeForSceneMethod\(sessionOptions\.translationMethod\)/);
  assert.match(regionController, /sourceLanguage: sessionOptions\.direction\?\.sourceLanguage/);
  assert.match(regionController, /targetLanguage: sessionOptions\.direction\?\.targetLanguage/);
});

test("local-result guidance is provider-gated and no longer directs users to AI review", () => {
  const renderers = [
    readSource("src/windows/text-input/renderer.js"),
    readSource("src/windows/local-translate/renderer.js"),
    readSource("src/services/region-capture/preview/renderer.js")
  ];
  const combined = renderers.join("\n");
  assert.doesNotMatch(combined, /后续使用 AI 精译复核/);
  for (const renderer of renderers) {
    assert.match(renderer, /本地翻译结果可能存在偏差，请核对原文。/);
  }
  assert.match(renderers[0], /result\.provider === "qwen-local"/);
  assert.match(renderers[1], /result\.provider === "qwen-local"/);
  assert.match(renderers[2], /!localTranslation \|\| categories\.length === 0/);
});

test("unchanged substantial translation is rejected but short technical text is allowed", () => {
  const paragraph = "This is a substantial English sentence that clearly needs to be translated into Chinese.";
  assert.throws(
    () => assertMeaningfulTranslation(paragraph, `  ${paragraph}\n`, { sourceLanguage: "en", targetLanguage: "zh-CN" }),
    error => error.code === "unchanged-response"
  );
  assert.doesNotThrow(() => assertMeaningfulTranslation("URL", "URL", { sourceLanguage: "en", targetLanguage: "zh-CN" }));
  assert.doesNotThrow(() => assertMeaningfulTranslation("https://example.com/a", "https://example.com/a", { sourceLanguage: "en", targetLanguage: "zh-CN" }));
});
