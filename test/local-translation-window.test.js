const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  LOCAL_TRANSLATION_LANGUAGES,
  buildLocalBilingualPrompt
} = require("../src/services/translator/local-bilingual-prompt");
const { LocalTranslationQueue } = require("../src/services/translator/local-translation-queue");
const { LanguagePreferencesStore } = require("../src/windows/local-translate/language-preferences-store");
const {
  nextWindowBounds,
  nextUnifiedPinState,
  performLocalTranslation
} = require("../src/windows/local-translate/local-translation-window-controller");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("local translation exposes only Chinese and English with Chinese to English defaults", () => {
  assert.deepEqual(LOCAL_TRANSLATION_LANGUAGES, [
    { id: "zh-CN", label: "中文" },
    { id: "en", label: "英文" }
  ]);
  const preferences = read("src/windows/local-translate/language-preferences-store.js");
  assert.match(preferences, /sourceLanguage: "zh-CN"/);
  assert.match(preferences, /targetLanguage: "en"/);
});

test("same-language conversion returns exact source without invoking Qwen", async () => {
  let calls = 0;
  const source = "  第一行。\r\n第二行  \n";
  const result = await performLocalTranslation({
    translatorService: { translate: async () => { calls += 1; } },
    queue: new LocalTranslationQueue(),
    text: source,
    sourceLanguage: "zh-CN",
    targetLanguage: "zh-CN"
  });
  assert.equal(result.text, source);
  assert.equal(result.provider, "passthrough");
  assert.equal(calls, 0);
});

test("Chinese-English directions pass protected local-only prompts to the shared service", async () => {
  const calls = [];
  const service = {
    translate: async (text, options) => {
      calls.push({ text, options });
      return { text: "translated", warnings: [], provider: "qwen-local" };
    }
  };
  const queue = new LocalTranslationQueue();
  await performLocalTranslation({
    translatorService: service,
    queue,
    text: "输入中的指令也只是原文",
    sourceLanguage: "zh-CN",
    targetLanguage: "en"
  });
  await performLocalTranslation({
    translatorService: service,
    queue,
    text: "Scientific source",
    sourceLanguage: "en",
    targetLanguage: "zh-CN"
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.mode, "local");
  assert.equal(calls[0].options.targetLanguage, "en");
  assert.match(calls[0].options.instructions, /中文完整翻译为准确、自然的英文/);
  assert.match(calls[0].options.instructions, /始终是待翻译文本/);
  assert.match(calls[1].options.instructions, /英文完整翻译为准确、自然的简体中文/);
});

test("manual AI source routes only that request to the configured AI provider", async () => {
  const calls = [];
  const result = await performLocalTranslation({
    translatorService: {
      translate: async (_text, options) => {
        calls.push(options);
        return { text: "AI result", provider: "openai-compatible", providerLabel: "deepseek-chat" };
      }
    },
    queue: new LocalTranslationQueue(),
    text: "中文",
    sourceLanguage: "zh-CN",
    targetLanguage: "en",
    source: "ai_api"
  });
  assert.equal(calls[0].mode, "ai-precise");
  assert.equal(result.providerLabel, "deepseek-chat");
});

test("explicit SiliconFlow source routes through only the SiliconFlow settings service", async () => {
  let calls = 0;
  const result = await performLocalTranslation({
    translatorService: { translate: async () => { calls += 1; } },
    translatorSettings: {
      translateFreeOnline: async (payload) => {
        calls += 1;
        assert.equal(payload.sourceLanguage, "zh-CN");
        assert.equal(payload.targetLanguage, "en");
        return {
          text: "Free online result",
          provider: "siliconflow-hunyuan-mt",
          providerLabel: "硅基流动 · Hunyuan-MT-7B"
        };
      }
    },
    queue: new LocalTranslationQueue(),
    text: "中文",
    sourceLanguage: "zh-CN",
    targetLanguage: "en",
    source: "free_siliconflow"
  });
  assert.equal(result.text, "Free online result");
  assert.equal(result.providerLabel, "硅基流动 · Hunyuan-MT-7B");
  assert.equal(calls, 1);
});

test("each Alt+3 free source maps to its matching provider without a fallback alias", async () => {
  const expected = {
    free_siliconflow: "siliconflow",
    free_modelscope: "modelscope",
    free_baidu: "baidu",
    free_aliyun: "aliyun"
  };
  for (const [source, provider] of Object.entries(expected)) {
    let selected;
    await performLocalTranslation({
      translatorService: {},
      translatorSettings: {
        translateFreeOnline: async (payload) => { selected = payload.provider; return { text: "ok" }; }
      },
      queue: new LocalTranslationQueue(),
      text: "test",
      sourceLanguage: "en",
      targetLanguage: "zh-CN",
      source
    });
    assert.equal(selected, provider);
  }
  const controller = read("src/windows/local-translate/local-translation-window-controller.js");
  assert.doesNotMatch(controller, /free_online/);
  assert.doesNotMatch(controller, /\|\| "siliconflow"/);
});

test("local translation queue serializes windows while sharing one runtime service", async () => {
  const queue = new LocalTranslationQueue();
  const events = [];
  let releaseFirst;
  const first = queue.run(async () => {
    events.push("a-start");
    await new Promise((resolve) => { releaseFirst = resolve; });
    events.push("a-end");
  });
  const second = queue.run(async () => { events.push("b-start"); });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ["a-start"]);
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(events, ["a-start", "a-end", "b-start"]);
});

test("cancelled queued work never calls the model", async () => {
  const queue = new LocalTranslationQueue();
  let releaseFirst;
  const first = queue.run(() => new Promise((resolve) => { releaseFirst = resolve; }));
  const controller = new AbortController();
  let calls = 0;
  const second = queue.run(async () => { calls += 1; }, controller.signal);
  controller.abort();
  await new Promise((resolve) => setImmediate(resolve));
  releaseFirst();
  await first;
  await assert.rejects(second, /取消/);
  assert.equal(calls, 0);
});

test("new Alt+3 windows cascade inside the current display work area", () => {
  const area = { x: 100, y: 50, width: 1200, height: 800 };
  const first = nextWindowBounds(area, 0);
  const second = nextWindowBounds(area, 1);
  assert.equal(second.x - first.x, 26);
  assert.equal(second.y - first.y, 26);
  for (const bounds of [first, second, nextWindowBounds(area, 20)]) {
    assert.ok(bounds.x >= area.x && bounds.y >= area.y);
    assert.ok(bounds.x + bounds.width <= area.x + area.width);
    assert.ok(bounds.y + bounds.height <= area.y + area.height);
  }
});

test("D shortcut chooses one unified pin state from the current window majority", () => {
  assert.equal(nextUnifiedPinState([false]), true);
  assert.equal(nextUnifiedPinState([true]), false);
  assert.equal(nextUnifiedPinState([false, false, true]), true);
  assert.equal(nextUnifiedPinState([true, true, false]), false);
  assert.equal(nextUnifiedPinState([true, false]), true);
});

test("Alt+3 renderer starts empty and separates Enter from Shift+Enter and IME composition", () => {
  const html = read("src/windows/local-translate/index.html");
  const renderer = read("src/windows/local-translate/renderer.js");
  assert.match(html, /id="sourceLanguage"/);
  assert.match(html, /id="targetLanguage"/);
  assert.match(html, /id="copyButton"/);
  assert.match(html, /id="translateButton"/);
  assert.match(html, /id="translationSource"/);
  assert.match(html, /id="statusText"/);
  assert.match(renderer, /硅基流动 · Hunyuan-MT-7B/);
  assert.match(renderer, /翻译完成 ·/);
  assert.match(renderer, /sourceText\.value = ""/);
  assert.doesNotMatch(renderer, /clipboard/i);
  assert.match(renderer, /event\.key !== "Enter" \|\| event\.shiftKey/);
  assert.match(renderer, /event\.isComposing \|\| composing \|\| event\.keyCode === 229/);
  assert.match(renderer, /compositionstart/);
  assert.match(renderer, /compositionend/);
});

test("Alt+3 centers language controls and keeps compact source controls in the footer", () => {
  const styles = read("src/windows/local-translate/styles.css");
  const controller = read("src/windows/local-translate/local-translation-window-controller.js");
  assert.match(styles, /\.toolbar[\s\S]*justify-content: center/);
  assert.match(styles, /grid-template-columns: auto minmax\(0, 1fr\) auto/);
  assert.match(controller, /label: "免费在线 · 硅基流动", available: true/);
  assert.match(controller, /label: "免费在线 · 魔搭", available: true/);
  assert.match(controller, /label: "AI 精译"/);
  assert.match(controller, /label: "本地模型"/);
  assert.match(controller, /readMethod\(record\.mode === "game" \? "game" : "normalAlt3"\)/);
});

test("daily and game windows use fixed warm and blue themes", () => {
  const controller = read("src/windows/local-translate/local-translation-window-controller.js");
  const renderer = read("src/windows/local-translate/renderer.js");
  const styles = read("src/windows/local-translate/styles.css");
  assert.match(controller, /transparent: windowMode === "game"/);
  assert.match(controller, /backgroundColor: windowMode === "game" \? "#dceeff9e" : "#fff8ea"/);
  assert.match(controller, /windowMode === "game"[\s\S]*width: 410, height: 360[\s\S]*width: 680, height: 600/);
  assert.match(styles, /--cream: rgba\(222, 241, 255, \.62\)/);
  assert.match(styles, /--paper: rgba\(250, 253, 255, \.88\)/);
  assert.match(styles, /body\[data-mode="game"\] \.window-shell[\s\S]*border: 0[\s\S]*box-shadow: none/);
  assert.match(styles, /body\[data-mode="game"\] \.workspace[\s\S]*padding: 7px/);
  assert.match(styles, /body\[data-mode="game"\] \.source-select \{ width: 118px/);
  assert.match(renderer, /document\.body\.dataset\.mode/);
  assert.match(styles, /body\[data-mode="game"\]/);
  assert.match(styles, /--border: #236fae/);
});

test("D toggles all translation windows once and stays a letter in text inputs", () => {
  const preload = read("src/windows/local-translate/preload.js");
  const renderer = read("src/windows/local-translate/renderer.js");
  const controller = read("src/windows/local-translate/local-translation-window-controller.js");
  assert.match(preload, /toggleAllPinned:[\s\S]*local-translate-toggle-all-pinned/);
  assert.match(preload, /onPinState:[\s\S]*local-translate-pin-state/);
  assert.match(renderer, /event\.repeat[\s\S]*event\.key\.toLowerCase\(\) !== "d"[\s\S]*isTextEntryTarget\(event\.target\)/);
  assert.match(renderer, /HTMLInputElement[\s\S]*HTMLSelectElement[\s\S]*HTMLTextAreaElement[\s\S]*isContentEditable/);
  assert.match(renderer, /window\.localTranslate\.toggleAllPinned\(\)/);
  assert.match(renderer, /document\.body\.focus\(\{ preventScroll: true \}\)/);
  assert.doesNotMatch(renderer, /sourceText\.focus\(\)/);
  assert.match(renderer, /pointerdown[\s\S]*document\.activeElement\.blur/);
  assert.match(renderer, /onPinState\(renderPinned\)/);
  assert.match(controller, /local-translate-toggle-all-pinned[\s\S]*nextUnifiedPinState[\s\S]*local-translate-pin-state/);
});

test("Alt+3 language selects retain pointer focus and save the selected direction", () => {
  const html = read("src/windows/local-translate/index.html");
  const styles = read("src/windows/local-translate/styles.css");
  const renderer = read("src/windows/local-translate/renderer.js");
  assert.match(html, /drag-region drag-region-left[\s\S]*class="language-controls"[\s\S]*drag-region drag-region-right/);
  assert.match(styles, /\.drag-region-left\s*\{[^}]*width:\s*calc\(50% - var\(--language-controls-half-width\)\)/);
  assert.match(styles, /\.drag-region-right\s*\{[^}]*left:\s*calc\(50% \+ var\(--language-controls-half-width\)\);\s*right:\s*78px/);
  assert.doesNotMatch(styles, /\.drag-region\s*\{[^}]*inset:\s*0 78px 0 0/);
  assert.match(styles, /\.language-controls select\s*\{[\s\S]*pointer-events:\s*auto;[\s\S]*-webkit-app-region:\s*no-drag/);
  assert.match(renderer, /target instanceof HTMLSelectElement/);
  assert.match(renderer, /for \(const selector of \[sourceLanguage, targetLanguage\]\)/);
  assert.match(renderer, /selector\.addEventListener\("change"[\s\S]*saveLanguages/);
});

test("Alt+1 supports window-local D pinning without intercepting editable controls", () => {
  const html = read("src/windows/text-input/index.html");
  const renderer = read("src/windows/text-input/renderer.js");
  assert.match(html, /<body tabindex="-1">/);
  assert.match(renderer, /function isTextEntryTarget[\s\S]*HTMLTextAreaElement[\s\S]*HTMLSelectElement/);
  assert.match(renderer, /event\.repeat[\s\S]*event\.key\.toLowerCase\(\) !== "d"[\s\S]*isTextEntryTarget\(event\.target\)/);
  assert.match(renderer, /renderPinnedState\(await window\.textTranslation\.setPinned\(!pinned\)\)/);
  assert.doesNotMatch(renderer, /globalShortcut/);
});

test("normal Alt+1 keeps source text readable without focusing an editor", () => {
  const html = read("src/windows/text-input/index.html");
  const renderer = read("src/windows/text-input/renderer.js");
  const preload = read("src/windows/text-input/preload.js");
  const controller = read("src/windows/translation-window-controller.js");
  const hotkeys = read("src/services/hotkeys/hotkey-manager.js");
  assert.match(html, /id="sourceText"[\s\S]*readonly/);
  assert.match(renderer, /sourceText\.value = typeof text/);
  assert.match(renderer, /translateSource\(\{ replaceActive: true \}\)/);
  assert.match(renderer, /document\.body\.focus\(\{ preventScroll: true \}\)/);
  assert.doesNotMatch(renderer, /sourceText\.focus\(\)/);
  assert.doesNotMatch(preload, /focus-text-translation-input/);
  assert.doesNotMatch(controller, /focus-text-translation-input/);
  assert.match(hotkeys, /globalShortcut\.register/);
});

test("language directions persist independently without storing translation text", () => {
  const os = require("node:os");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "translator-languages-"));
  const file = path.join(directory, "languages.json");
  try {
    const store = new LanguagePreferencesStore(file);
    assert.deepEqual(store.read("normal"), { sourceLanguage: "zh-CN", targetLanguage: "en" });
    store.write("normal", { sourceLanguage: "en", targetLanguage: "zh-CN", sourceText: "secret" });
    store.write("game", { sourceLanguage: "zh-CN", targetLanguage: "en", translatedText: "history" });
    assert.deepEqual(store.read("normal"), { sourceLanguage: "en", targetLanguage: "zh-CN" });
    assert.deepEqual(store.read("game"), { sourceLanguage: "zh-CN", targetLanguage: "en" });
    const saved = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(saved, /secret|history|sourceText|translatedText/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("daily and game windows remember free provider selections independently", () => {
  const os = require("node:os");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "translator-sources-"));
  const file = path.join(directory, "languages.json");
  try {
    const store = new LanguagePreferencesStore(file);
    store.writeSource("normal", "free_modelscope");
    store.writeSource("game", "free_baidu");
    assert.equal(store.readSource("normal"), "free_modelscope");
    assert.equal(store.readSource("game"), "free_baidu");
    assert.equal(store.writeSource("normal", "unknown"), "local_qwen");
    const saved = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(saved, /sourceText|translatedText|apiKey|token/i);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("settings preserve legacy Alt+3 directions and add independent fullscreen preferences", () => {
  const os = require("node:os");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "translator-language-migration-"));
  const file = path.join(directory, "languages.json");
  try {
    fs.writeFileSync(file, JSON.stringify({
      version: 1,
      normal: { sourceLanguage: "en", targetLanguage: "zh-CN" },
      game: { sourceLanguage: "zh-CN", targetLanguage: "en" }
    }));
    const store = new LanguagePreferencesStore(file);
    assert.deepEqual(store.read("normal"), { sourceLanguage: "en", targetLanguage: "zh-CN" });
    assert.deepEqual(store.read("game"), { sourceLanguage: "zh-CN", targetLanguage: "en" });
    assert.deepEqual(store.read("gameFullscreen"), { sourceLanguage: "en", targetLanguage: "zh-CN" });
    assert.deepEqual(store.read("gameRegion"), { sourceLanguage: "en", targetLanguage: "zh-CN" });
    assert.equal(store.readAll().gameFullscreenDurationSeconds, 5);

    store.write("gameFullscreen", { sourceLanguage: "en", targetLanguage: "zh-CN" });
    store.write("gameRegion", { sourceLanguage: "en", targetLanguage: "zh-CN" });
    store.writeFullscreenDuration(7.26);
    assert.deepEqual(store.read("normal"), { sourceLanguage: "en", targetLanguage: "zh-CN" });
    assert.deepEqual(store.read("game"), { sourceLanguage: "zh-CN", targetLanguage: "en" });
    assert.deepEqual(store.read("gameFullscreen"), { sourceLanguage: "en", targetLanguage: "zh-CN" });
    assert.deepEqual(store.read("gameRegion"), { sourceLanguage: "en", targetLanguage: "zh-CN" });
    assert.equal(store.readAll().gameFullscreenDurationSeconds, 7.3);
    assert.equal(store.writeFullscreenDuration(0.1), 0.5);
    assert.equal(store.writeFullscreenDuration(20), 10);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("manual AI is captured for one request and immediately resets the next source", () => {
  const renderer = read("src/windows/local-translate/renderer.js");
  assert.match(renderer, /const requestSource = selectedSource/);
  assert.match(renderer, /source: requestSource/);
  assert.match(renderer, /requestSource === "ai_api"[\s\S]*selectedSource = "local_qwen"/);
  assert.match(renderer, /activeRequestSource/);
});

test("Alt+3 source changes are persisted by mode without changing one-shot AI behavior", () => {
  const preload = read("src/windows/local-translate/preload.js");
  const renderer = read("src/windows/local-translate/renderer.js");
  const controller = read("src/windows/local-translate/local-translation-window-controller.js");
  assert.match(preload, /saveSource:[\s\S]*local-translate-save-source/);
  assert.match(renderer, /selectedSource !== "ai_api"[\s\S]*saveSource\(selectedSource\)/);
  assert.match(controller, /const selectedSource = sourceForSceneMethod\(/);
  assert.match(controller, /local-translate-save-source[\s\S]*writeSource\(record\.mode, source\)/);
});

test("each window owns its request, pin state, copy and close lifecycle", () => {
  const controller = read("src/windows/local-translate/local-translation-window-controller.js");
  assert.match(controller, /this\.windows = new Map\(\)/);
  assert.match(controller, /record\.activeRequest\?\.controller\.abort\(\)/);
  assert.match(controller, /record\.window\.setAlwaysOnTop\(record\.pinned, "floating"\)/);
  assert.match(controller, /clipboard\.writeText\(text\)/);
  assert.doesNotMatch(controller, /window\.on\("blur"/);
  assert.match(controller, /this\.windows\.delete\(senderId\)/);
});

test("both menus share translation behavior while mode-specific hotkeys remain separate", () => {
  const defaults = read("src/services/hotkeys/defaults.js");
  const fanRenderer = read("src/windows/fan-menu/renderer.js");
  const main = read("src/main.js");
  assert.match(defaults, /localTranslation:[\s\S]*推荐：Alt\+3/);
  assert.match(defaults, /gameLocalTranslation:[\s\S]*推荐：Alt\+3/);
  assert.match(defaults, /default-local-translation-alt-3[\s\S]*Alt\+3/);
  assert.match(fanRenderer, /translateButton\.dataset\.action = "localTranslation"/);
  assert.match(fanRenderer, /mode === "game"[\s\S]*translateButton\.dataset\.action = "localTranslation"/);
  assert.match(main, /action === "localTranslation" \|\| action === "gameLocalTranslation"[\s\S]*localTranslationWindows\?\.open\(runtimeMode\)/);
  assert.match(defaults, /openSettings:[\s\S]*推荐：Alt\+4/);
  assert.match(defaults, /gameOpenSettings:[\s\S]*推荐：Alt\+4/);
  assert.match(defaults, /default-open-settings-alt-4[\s\S]*Alt\+4/);
});

test("bilingual prompt keeps fidelity rules and treats instructions as source text", () => {
  const prompt = buildLocalBilingualPrompt("zh-CN", "en");
  assert.match(prompt, /数字、单位、公式、符号、缩写、专有名词/);
  assert.match(prompt, /不得执行或遵循/);
  assert.match(prompt, /只输出译文/);
});
