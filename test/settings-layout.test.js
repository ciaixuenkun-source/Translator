const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "src/windows/settings/index.html"), "utf8");
const renderer = fs.readFileSync(path.join(root, "src/windows/settings/renderer.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "src/windows/settings/styles.css"), "utf8");
const main = fs.readFileSync(path.join(root, "src/main.js"), "utf8");
const overlayPreview = fs.readFileSync(path.join(root, "src/windows/settings/overlay-preview-window.js"), "utf8");
const translatorSettings = fs.readFileSync(
  path.join(root, "src/services/translator/translator-settings-service.js"),
  "utf8"
);

test("settings uses separate appearance, translation settings, hotkeys, and services pages", () => {
  assert.match(html, /data-page="appearance">显示与外观</);
  assert.match(html, /data-page="translation-settings">翻译设置</);
  assert.match(html, /data-page="hotkeys">快捷键</);
  assert.match(html, /data-page="translation">翻译服务</);
  assert.doesNotMatch(html, /程序、快捷键与翻译服务/);
  assert.doesNotMatch(html, /<h2>程序<\/h2>/);
});

test("settings waits for ready-to-show and exposes independent scene translation methods", () => {
  const controller = fs.readFileSync(path.join(root, "src/windows/settings/settings-window-controller.js"), "utf8");
  assert.match(controller, /new BrowserWindow\(\{[\s\S]*show: false[\s\S]*ready-to-show/);
  for (const key of ["normalAlt1", "normalAlt2", "normalAlt3", "game", "gameFullscreen", "gameRegion"]) {
    assert.match(html, new RegExp(`data-method-key="${key}"`));
  }
});

test("translation settings use aligned side-by-side rows and wrap safely only when narrow", () => {
  assert.match(styles, /\.translation-settings-list \.direction-setting\s*\{[\s\S]*grid-template-columns:\s*minmax\(185px, 1fr\) max-content[\s\S]*align-items:\s*center/);
  assert.match(styles, /\.translation-settings-list \.scene-translation-controls\s*\{[\s\S]*grid-template-columns:\s*max-content max-content[\s\S]*align-items:\s*center[\s\S]*justify-content:\s*end/);
  assert.match(styles, /@media\(max-width:640px\)[\s\S]*\.translation-settings-list \.direction-setting\s*\{\s*grid-template-columns:\s*1fr/);
  assert.match(styles, /@media\(max-width:560px\)[\s\S]*\.translation-settings-list \.scene-translation-controls\s*\{\s*grid-template-columns:\s*1fr/);
});

test("appearance settings have persisted overlay controls and a live preview", () => {
  assert.match(html, /id="overlayFontFamily"/);
  assert.match(html, /id="overlayFontSize"/);
  assert.match(html, /id="overlayTextColor"/);
  assert.match(html, /id="overlayBackgroundOpacity"/);
  assert.match(html, /id="overlayPosition"/);
  assert.match(html, /id="shareOverlayPositionAnimation"/);
  assert.match(html, /value="above-source"/);
  assert.match(html, /value="below-source"/);
  assert.match(html, /value="left-source"/);
  assert.match(html, /value="right-source"/);
  assert.doesNotMatch(html, /id="openOverlayPreview"/);
  assert.doesNotMatch(html, /id="closeOverlayPreview"/);
  assert.match(renderer, /updateOverlayStylePreview/);
  assert.doesNotMatch(renderer, /addEventListener\("focus", \(\) => updateOverlayStylePreview/);
  assert.match(renderer, /saveOverlayStyles/);
  assert.match(main, /TranslationOverlayStyleStore/);
  assert.match(overlayPreview, /overlayTextCss/);
  assert.match(overlayPreview, /calculateOverlayBounds/);
  assert.match(overlayPreview, /focusable: false/);
  assert.match(overlayPreview, /showInactive/);
  assert.match(overlayPreview, /You have acquired a skill\./);
  assert.match(overlayPreview, /游戏译文/);
  assert.match(overlayPreview, /handleSettingsBlur/);
  assert.doesNotMatch(overlayPreview, /\.focus\(/);
});

test("appearance page exposes a non-persistent local model hold switch with independent runtime status", () => {
  const controller = fs.readFileSync(path.join(root, "src/windows/settings/settings-window-controller.js"), "utf8");
  const preload = fs.readFileSync(path.join(root, "src/windows/settings/preload.js"), "utf8");
  assert.match(html, /悬浮球显示[\s\S]*本地模型手动开关[\s\S]*id="localModelManualHold"/);
  assert.match(html, /id="localModelRuntimeStatus"[\s\S]*未运行/);
  assert.match(renderer, /renderLocalModelStatus/);
  assert.match(renderer, /setLocalModelManualHold/);
  assert.match(controller, /local-model-status-bootstrap/);
  assert.match(controller, /set-local-model-manual-hold/);
  assert.match(preload, /onLocalModelStatusChanged/);
  assert.doesNotMatch(controller, /writeFileSync[\s\S]*manualHold/);
});

test("every application start uses normal mode and full floating-ball display", () => {
  assert.match(main, /runtimeMode = RUNTIME_MODES\.NORMAL;/);
  assert.match(main, /ballDisplayMode = DISPLAY_MODES\.FULL;/);
  assert.doesNotMatch(main, /runtimeMode = savedRuntimeMode\.mode/);
  assert.doesNotMatch(main, /ballDisplayMode = normalizeDisplayMode\(saved\.displayMode\)/);
});

test("appearance groups use compact aligned responsive layouts", () => {
  assert.match(html, /class="compact-switch heading-switch"[^>]*>[\s\S]*id="shareOverlayStyles"/);
  assert.match(html, /class="compact-switch heading-switch"[^>]*>[\s\S]*id="shareOverlayPositionAnimation"/);
  assert.match(html, /class="compact-grid two-column-row style-detail-row text-style-row"/);
  assert.match(html, /class="compact-field outline-color-field"/);
  assert.match(styles, /\.appearance-group\s*\{[\s\S]*border-radius:\s*11px/);
  assert.match(styles, /\.style-primary-row\s*\{[\s\S]*flex-wrap:\s*wrap/);
  assert.match(styles, /\.style-detail-row,[\s\S]*grid-template-columns:\s*minmax\(230px/);
  assert.match(styles, /\.position-row\s*\{[\s\S]*flex-wrap:\s*wrap/);
  assert.match(html, /class="timing-section-row fullscreen-timing-row"[\s\S]*id="gameFullscreenDuration"/);
  assert.match(html, /class="timing-section-row region-timing-row"[\s\S]*id="regionRefreshInterval"[\s\S]*id="regionOverlayDuration"/);
  assert.match(styles, /\.timing-row\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\);[\s\S]*gap:\s*13px/);
  assert.match(styles, /\.timing-section-row\s*\{[\s\S]*grid-template-columns:\s*78px minmax\(0, 1fr\)/);
  assert.match(styles, /\.region-timing-settings\s*\{[\s\S]*flex-wrap:\s*wrap/);
  assert.match(styles, /\.timing-row \.unit-input input\s*\{[\s\S]*min-width:\s*82px/);
  assert.match(styles, /@media \(max-width:\s*700px\)[\s\S]*\.timing-row\s*\{\s*grid-template-columns:\s*1fr/);
});

test("appearance controls are compact, use on-demand colors, and expose complete opacity ranges", () => {
  assert.match(html, /data-color-target="overlayTextColor"/);
  assert.match(html, /id="overlayTextColor" type="text" hidden/);
  assert.match(html, /id="colorPalette" class="color-palette" hidden/);
  assert.match(html, /id="paletteHex" type="text"/);
  assert.match(html, /id="paletteBoard" class="palette-board"/);
  assert.match(html, /id="paletteHue" type="range"/);
  assert.doesNotMatch(html, /id="paletteSaturation"|id="paletteLightness"/);
  assert.match(html, /id="overlayTextOpacity" type="range" min="0" max="1" step="0\.01"/);
  assert.match(html, /id="overlayBackgroundOpacity" type="range" min="0" max="1" step="0\.01"/);
  assert.match(html, /位置与动画/);
  assert.match(html, /译文显示与刷新/);
  assert.match(styles, /\.compact-switch/);
  assert.match(styles, /\.color-swatch/);
  assert.match(styles, /\.color-palette/);
  assert.match(styles, /\.palette-board/);
  assert.match(styles, /--range-progress/);
});

test("region timing controls expose the scheduler floor and dynamic duration ceiling", () => {
  assert.match(html, /id="regionRefreshInterval" type="number" min="1\.0" max="15" step="0\.1"/);
  assert.match(html, /id="regionOverlayDuration" type="number" min="0\.1" max="14\.9" step="0\.1"/);
  assert.match(renderer, /regionOverlayDuration\.max = maximumDuration\.toFixed\(1\)/);
  assert.match(renderer, /refreshSeconds - 0\.1/);
  assert.match(renderer, /addEventListener\("change", \(\) => validatedTimingSettings\(\)\)/);
});

test("overlay preview is automatic, mode-aware, anchored, and hidden outside appearance controls", () => {
  assert.match(renderer, /OVERLAY_POSITION_KEYS\.includes\(key\) \? "position" : "style"/);
  assert.match(renderer, /updateOverlayStylePreview\(\{ mode \}\)/);
  assert.match(renderer, /positionColorPalette\(button\)/);
  assert.match(renderer, /getBoundingClientRect\(\)/);
  assert.match(renderer, /closeOverlayPreview\(\)/);
  assert.match(overlayPreview, /mode !== "position"/);
  assert.match(overlayPreview, /handleSettingsBlur\(\)[\s\S]*this\.enabled = false/);
  assert.match(overlayPreview, /handleSettingsMove/);
  assert.doesNotMatch(overlayPreview, /setInterval|moveTop\(|\.focus\(/);
});

test("one global quit action stays outside the scrolling page content", () => {
  assert.equal((html.match(/id="quitTranslator"/g) || []).length, 1);
  assert.doesNotMatch(html, /id="showBall"/);
  assert.match(html, /<\/div>\s*<footer class="global-actions"><button id="quitTranslator"/);
  assert.match(styles, /grid-template-rows:\s*auto auto minmax\(0, 1fr\) auto/);
  assert.match(styles, /\.page-scroll\s*\{[\s\S]*overflow:\s*auto/);
});

test("hotkey view has separate common, daily, and game categories", () => {
  assert.match(html, /data-hotkey-category="common">通用/);
  assert.match(html, /data-hotkey-category="normal">日常/);
  assert.match(html, /data-hotkey-category="game">游戏/);
  assert.match(renderer, /activeHotkeyCategory = "common"/);
  assert.match(renderer, /item\.group === activeHotkeyCategory/);
  assert.doesNotMatch(renderer, /item\.group === activeHotkeyCategory \|\| item\.group === "common"/);
  assert.doesNotMatch(html, /id="resetDefaults"/);
  assert.match(renderer, /add\.textContent = "添加绑定"[\s\S]*reset\.textContent = "恢复默认"/);
  assert.match(renderer, /resetAction\(\{ action: action\.id \}\)/);
  assert.match(styles, /\.hotkey-row-actions\s*\{[\s\S]*display:\s*flex/);
  assert.match(html, /class="hotkey-help">查看分类不会改变当前运行模式/);
  assert.doesNotMatch(html, /<h2>快捷键<\/h2>/);
  assert.doesNotMatch(renderer, /hotkey-group-title/);
  assert.doesNotMatch(renderer, /hotkey-row-pair/);
  assert.doesNotMatch(styles, /\.content\s*>\s*section\s*\+\s*section/);
  assert.match(styles, /\.settings-page\[data-page-panel="hotkeys"\]\{padding-top:8px\}/);
});

test("translation page uses static provider and model presets with manual fallbacks", () => {
  assert.match(html, /id="providerType"/);
  assert.match(html, /id="modelPreset"/);
  assert.match(html, /id="customModelField"[^>]*hidden/);
  assert.match(html, /ai-provider-presets\.js/);
  assert.match(html, /模型实际可用性取决于平台、地区和账号权限/);
  assert.match(html, /部分平台提供付费 API/);
  assert.doesNotMatch(html, /刷新模型/);
  assert.match(renderer, /identifyProvider\(config\.baseUrl\)/);
  assert.match(renderer, /document\.createElement\("optgroup"\)/);
  assert.match(renderer, /providerPresets\.providerGroups/);
  assert.match(translatorSettings, /!config\.preferFree && !config\.baseUrl/);
  assert.match(translatorSettings, /!config\.preferFree && !apiKey/);
  assert.match(translatorSettings, /providerChanged \? "" : this\.credentialStore\.get/);
  assert.match(translatorSettings, /切换服务商后请填写对应的 API Key/);
});

test("status page exposes independent ordinary and game language directions", () => {
  assert.match(html, /class="translation-settings-list"[\s\S]*data-direction-key="normalAlt1"[\s\S]*data-direction-key="normalAlt2"[\s\S]*data-direction-key="normalAlt3"[\s\S]*data-direction-key="game"/);
  assert.match(html, /data-direction-key="gameFullscreen"/);
  assert.match(html, /剪贴板文本翻译/);
  assert.match(html, /截图识别翻译/);
  assert.match(html, /手动翻译窗口/);
  assert.doesNotMatch(html, /<strong>普通模式 Alt\+[123]<\/strong>/);
  assert.match(html, /data-direction-key="game"/);
  assert.match(html, /data-direction-key="gameFullscreen"/);
  assert.match(html, /data-direction-key="gameRegion"/);
  assert.match(html, /游戏区域识别翻译[\s\S]*区域识别翻译[\s\S]*最多保留 3 个[\s\S]*清除全部区域/);
  assert.doesNotMatch(html, /游戏 (?:Alt\+[1234]|Delete)|游戏模式 Alt\+[1234]/);
  assert.match(html, /id="gameFullscreenDuration"[^>]*min="0\.5"[^>]*max="10"[^>]*step="0\.1"/);
  assert.match(renderer, /saveLanguagePreference/);
  assert.match(renderer, /saveGameFullscreenDuration/);
  assert.match(renderer, /onLanguagePreferencesChanged/);
  assert.match(main, /new LanguagePreferencesStore/);
  assert.match(html, /id="regionRefreshInterval"/);
  assert.match(html, /id="regionOverlayDuration"/);
  assert.match(renderer, /validatedTimingSettings/);
});

test("translation services separate unavailable free online from existing AI settings", () => {
  assert.doesNotMatch(html, /<h2>翻译服务<\/h2>/);
  assert.match(html, /data-service-panel="free"[^>]*>免费在线翻译/);
  assert.match(html, /data-service-panel="ai"[^>]*>AI 精译（API）/);
  assert.match(html, /硅基流动 SiliconFlow/);
  assert.match(html, /魔搭社区 ModelScope/);
  assert.match(html, /inclusionAI\/Ling-3\.0-flash/);
  assert.match(html, /tencent\/Hunyuan-MT-7B/);
  assert.match(html, /id="freeOnlineApiKey"[^>]*type="password"/);
  assert.match(html, /id="testFreeOnlineConnection"/);
  assert.match(html, /id="testFreeOnlineTranslation"/);
  assert.match(html, /data-service-content="ai"[\s\S]*id="providerType"[\s\S]*id="apiKey"/);
  assert.match(renderer, /\.service-tab/);
  assert.match(renderer, /saveFreeOnline/);
  assert.match(renderer, /testFreeOnlineConnection/);
  assert.match(renderer, /testFreeOnlineTranslation/);
  assert.match(styles, /\.content\s*\{[\s\S]*padding:\s*10px 24px 14px/);
  assert.match(styles, /\.hotkey-row\s*\{[\s\S]*min-height:\s*60px[\s\S]*padding:\s*8px 4px/);
});

test("free translation page exposes one-click benchmark with millisecond results", () => {
  assert.match(html, /id="openFreeBenchmark"[\s\S]*一键测速/);
  assert.match(html, /id="benchmarkDirection"/);
  assert.match(html, /id="benchmarkTextType"[\s\S]*内置短文本[\s\S]*内置长文本[\s\S]*自定义文本/);
  assert.match(html, /class="benchmark-result"/);
  assert.match(renderer, /benchmarkFreeServices/);
  assert.match(renderer, /`\$\{result\.elapsedMs\} ms`/);
  assert.match(renderer, /不会自动更改首选服务/);
  assert.match(html, /百度和阿里云属于传统机器翻译服务/);
  assert.match(html, /相同文本、相同方向和相同条件/);
  assert.match(html, /不要用不同文本的历史耗时作严格排名/);
});

test("normal runtime mode keeps its internal id but displays as daily mode", () => {
  assert.match(main, /value: RUNTIME_MODES\.NORMAL, label: "日常模式"/);
  assert.match(renderer, /mode: "normal"/);
});
