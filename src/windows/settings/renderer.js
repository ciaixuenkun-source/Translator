const hotkeyList = document.getElementById("hotkeyList");
const captureOverlay = document.getElementById("captureOverlay");
const capturedValue = document.getElementById("capturedValue");
const captureError = document.getElementById("captureError");
const confirmCapture = document.getElementById("confirmCapture");
const toast = document.getElementById("toast");
const apiBaseUrl = document.getElementById("apiBaseUrl");
const apiKey = document.getElementById("apiKey");
const providerType = document.getElementById("providerType");
const modelPreset = document.getElementById("modelPreset");
const modelName = document.getElementById("modelName");
const customModelField = document.getElementById("customModelField");
const providerNote = document.getElementById("providerNote");
const serviceStatus = document.getElementById("serviceStatus");
const testService = document.getElementById("testService");
const saveService = document.getElementById("saveService");
const freeOnlineStatus = document.getElementById("freeOnlineStatus");
const freeOnlineApiKey = document.getElementById("freeOnlineApiKey");
const freeOnlineTestDirection = document.getElementById("freeOnlineTestDirection");
const freeOnlineTestText = document.getElementById("freeOnlineTestText");
const freeOnlineTestResult = document.getElementById("freeOnlineTestResult");
const freeOnlineMessage = document.getElementById("freeOnlineMessage");
const testFreeOnlineConnection = document.getElementById("testFreeOnlineConnection");
const testFreeOnlineTranslation = document.getElementById("testFreeOnlineTranslation");
const saveFreeOnline = document.getElementById("saveFreeOnline");
const modelScopeStatus = document.getElementById("modelScopeStatus");
const modelScopeToken = document.getElementById("modelScopeToken");
const modelScopeTestDirection = document.getElementById("modelScopeTestDirection");
const modelScopeTestText = document.getElementById("modelScopeTestText");
const modelScopeTestResult = document.getElementById("modelScopeTestResult");
const modelScopeMessage = document.getElementById("modelScopeMessage");
const testModelScopeConnection = document.getElementById("testModelScopeConnection");
const testModelScopeTranslation = document.getElementById("testModelScopeTranslation");
const saveModelScope = document.getElementById("saveModelScope");
const defaultAiTranslation = document.getElementById("defaultAiTranslation");
const aiProviderFields = document.getElementById("aiProviderFields");
const ballDisplayOptions = document.getElementById("ballDisplayOptions");
const runtimeModeOptions = document.getElementById("runtimeModeOptions");
const localModelManualHold = document.getElementById("localModelManualHold");
const localModelRuntimeStatus = document.getElementById("localModelRuntimeStatus");
const buildInfo = document.getElementById("buildInfo");
const networkStatus = document.getElementById("networkStatus");
const gameFullscreenDuration = document.getElementById("gameFullscreenDuration");
const regionRefreshInterval = document.getElementById("regionRefreshInterval");
const regionOverlayDuration = document.getElementById("regionOverlayDuration");
const timingValidationMessage = document.getElementById("timingValidationMessage");
const directionControls = [...document.querySelectorAll(".language-direction")];
const overlayStyleControls = {
  fontFamily: document.getElementById("overlayFontFamily"),
  fontSize: document.getElementById("overlayFontSize"),
  fontWeight: document.getElementById("overlayFontWeight"),
  textColor: document.getElementById("overlayTextColor"),
  textOpacity: document.getElementById("overlayTextOpacity"),
  outline: document.getElementById("overlayOutline"),
  outlineColor: document.getElementById("overlayOutlineColor"),
  backgroundColor: document.getElementById("overlayBackgroundColor"),
  backgroundOpacity: document.getElementById("overlayBackgroundOpacity"),
  position: document.getElementById("overlayPosition"),
  offsetX: document.getElementById("overlayOffsetX"),
  offsetY: document.getElementById("overlayOffsetY"),
  fade: document.getElementById("overlayFade"),
  animationDurationMs: document.getElementById("overlayAnimationDuration")
};
const shareOverlayStyles = document.getElementById("shareOverlayStyles");
const shareOverlayPositionAnimation = document.getElementById("shareOverlayPositionAnimation");
const overlayStyleScope = document.getElementById("overlayStyleScope");
const colorPalette = document.getElementById("colorPalette");
const paletteBoard = document.getElementById("paletteBoard");
const paletteHue = document.getElementById("paletteHue");
const paletteHex = document.getElementById("paletteHex");
const colorPicker = window.overlayColorPicker;
const OVERLAY_VISUAL_KEYS = ["fontFamily", "fontSize", "fontWeight", "textColor", "textOpacity", "outline", "outlineColor", "backgroundColor", "backgroundOpacity"];
const OVERLAY_POSITION_KEYS = ["position", "offsetX", "offsetY", "fade", "animationDurationMs"];

let snapshot = null;
let ballDisplaySnapshot = null;
let runtimeModeSnapshot = null;
let captureContext = null;
let capturedBinding = null;
let toastTimer = null;
let serviceBusy = false;
let freeOnlineBusy = false;
let modelScopeBusy = false;
let activeHotkeyCategory = "common";
let networkTimer = null;
let languagePreferencesSnapshot = null;
let overlayStylesSnapshot = null;
let activeOverlayScope = "fullscreen";
let activeColorControl = null;
let paletteSaturation = 0;
let paletteValue = 0;
let paletteDragging = false;
const providerPresets = window.aiProviderPresets;
const settingLanguages = [
  { id: "zh-CN", label: "中文" },
  { id: "en", label: "英文" }
];
const sceneMethodControls = [...document.querySelectorAll("[data-method-key]")];
const sceneTranslationMethods = [
  { id: "follow-default", label: "跟随默认设置" },
  { id: "free-online", label: "免费在线" },
  { id: "ai-api", label: "AI 精译" },
  { id: "local", label: "本地翻译" }
];

function renderLanguagePreferences(config) {
  if (!config) return;
  languagePreferencesSnapshot = config;
  for (const control of directionControls) {
    const direction = config[control.dataset.directionKey];
    if (!direction) continue;
    const [source, target] = control.querySelectorAll("select");
    for (const select of [source, target]) {
      if (!select.options.length) {
        select.replaceChildren(...settingLanguages.map((language) => new Option(language.label, language.id)));
      }
    }
    source.value = direction.sourceLanguage;
    target.value = direction.targetLanguage;
  }
  for (const select of sceneMethodControls) {
    if (!select.options.length) {
      select.replaceChildren(...sceneTranslationMethods.map((method) => new Option(method.label, method.id)));
    }
    select.value = config[`${select.dataset.methodKey}Method`] || "follow-default";
  }
  gameFullscreenDuration.value = Number(config.gameFullscreenDurationSeconds || 5).toFixed(1);
}

function selectedOverlayStyle() {
  if (!overlayStylesSnapshot) return {};
  const scope = overlayStyleScope.value;
  const selected = { ...(overlayStylesSnapshot[scope] || {}) };
  if (scope === "region" && overlayStylesSnapshot.shareStyles !== false) {
    for (const key of OVERLAY_VISUAL_KEYS) selected[key] = overlayStylesSnapshot.fullscreen[key];
  }
  if (scope === "region" && overlayStylesSnapshot.sharePositionAnimation !== false) {
    for (const key of OVERLAY_POSITION_KEYS) selected[key] = overlayStylesSnapshot.fullscreen[key];
  }
  return selected;
}

function overlayStyleFromControls() {
  const result = {};
  for (const [key, control] of Object.entries(overlayStyleControls)) {
    result[key] = control.type === "checkbox" ? control.checked
      : ["number", "range"].includes(control.type) ? Number(control.value) : control.value;
  }
  return result;
}

function commitOverlayControls() {
  if (!overlayStylesSnapshot) return;
  const controls = overlayStyleFromControls();
  const scope = overlayStyleScope.value;
  const visualTarget = scope === "region" && overlayStylesSnapshot.shareStyles !== false ? "fullscreen" : scope;
  const positionTarget = scope === "region" && overlayStylesSnapshot.sharePositionAnimation !== false ? "fullscreen" : scope;
  for (const key of OVERLAY_VISUAL_KEYS) overlayStylesSnapshot[visualTarget][key] = controls[key];
  for (const key of OVERLAY_POSITION_KEYS) overlayStylesSnapshot[positionTarget][key] = controls[key];
}

function updateCompactStyleIndicators() {
  const style = overlayStyleFromControls();
  for (const control of [overlayStyleControls.textColor, overlayStyleControls.backgroundColor, overlayStyleControls.outlineColor]) {
    const button = document.querySelector(`[data-color-target="${control.id}"]`);
    button?.style.setProperty("--swatch", control.value);
    if (button) button.querySelector("code").textContent = control.value.toUpperCase();
  }
  for (const control of [overlayStyleControls.textOpacity, overlayStyleControls.backgroundOpacity]) {
    const percent = Math.round(Number(control.value) * 100);
    const output = document.querySelector(`[data-range-for="${control.id}"]`);
    if (output) output.textContent = `${percent}%`;
    control.style.setProperty("--range-progress", `${percent}%`);
  }
  return style;
}

function updateOverlayStylePreview({ open = true, mode = "style" } = {}) {
  const style = updateCompactStyleIndicators();
  window.translatorSettings.updateOverlayPreview({ style, kind: overlayStyleScope.value, open, mode });
}

function updatePaletteColor(hex) {
  if (!activeColorControl || !/^#[0-9a-f]{6}$/i.test(hex)) return;
  activeColorControl.value = hex.toLowerCase();
  paletteHex.value = hex.toUpperCase();
  paletteBoard.style.setProperty("--palette-hue", paletteHue.value);
  paletteBoard.style.setProperty("--palette-saturation", `${paletteSaturation}%`);
  paletteBoard.style.setProperty("--palette-value-y", `${100 - paletteValue}%`);
  updateOverlayStylePreview({ mode: "style" });
}

function positionColorPalette(anchor) {
  const rect = anchor.getBoundingClientRect();
  const width = 240, height = 205, gap = 7;
  let left = Math.min(window.innerWidth - width - 8, Math.max(8, rect.left));
  let top = rect.top - height - gap;
  if (top < 8) top = Math.min(window.innerHeight - height - 8, rect.bottom + gap);
  colorPalette.style.left = `${left}px`;
  colorPalette.style.top = `${Math.max(8, top)}px`;
}

function openColorPalette(button, control) {
  if (!overlayStylesSnapshot || !control || button.disabled) return;
  const state = colorPicker.paletteStateForColor(control.value);
  if (!state) return;
  activeColorControl = control;
  paletteHue.value = state.hue;
  paletteSaturation = state.saturation;
  paletteValue = state.value;
  paletteHex.value = state.displayHex;
  updatePaletteColor(state.hex);
  colorPalette.hidden = false;
  positionColorPalette(button);
  updateOverlayStylePreview({ mode: "style" });
}

function closeColorPalette() { colorPalette.hidden = true; activeColorControl = null; }

function renderOverlayStyles(config) {
  if (!config) return;
  overlayStylesSnapshot = config;
  shareOverlayStyles.checked = config.shareStyles !== false;
  shareOverlayPositionAnimation.checked = config.sharePositionAnimation !== false;
  const style = selectedOverlayStyle();
  for (const [key, control] of Object.entries(overlayStyleControls)) {
    if (control.type === "checkbox") control.checked = style[key] !== false;
    else control.value = style[key];
  }
  document.querySelectorAll(".color-swatch").forEach((button) => { button.disabled = false; });
  regionRefreshInterval.value = (Number(config.regionRefreshIntervalMs || 1600) / 1000).toFixed(1);
  regionOverlayDuration.value = (Number(config.regionOverlayDurationMs || 1200) / 1000).toFixed(1);
  validatedTimingSettings();
  updateCompactStyleIndicators();
}

async function saveDirection(control) {
  const [source, target] = control.querySelectorAll("select");
  const result = await window.translatorSettings.saveLanguagePreference({
    key: control.dataset.directionKey,
    sourceLanguage: source.value,
    targetLanguage: target.value
  });
  if (result?.ok) {
    renderLanguagePreferences(result.snapshot);
    showToast("翻译方向已保存");
  } else {
    renderLanguagePreferences(languagePreferencesSnapshot);
    showToast(result?.message || "保存失败");
  }
}

async function saveSceneMethod(control) {
  const result = await window.translatorSettings.saveSceneTranslationMethod({
    key: control.dataset.methodKey,
    method: control.value
  });
  if (result?.ok) {
    renderLanguagePreferences(result.snapshot);
    showToast("翻译方式已保存");
  } else {
    renderLanguagePreferences(languagePreferencesSnapshot);
    showToast(result?.message || "保存失败");
  }
}

async function saveFullscreenDuration() {
  const numeric = Number(gameFullscreenDuration.value);
  if (!Number.isFinite(numeric)) return;
  const result = await window.translatorSettings.saveGameFullscreenDuration(numeric);
  if (result?.ok) {
    renderLanguagePreferences(result.snapshot);
    showToast("停留时间已保存");
  } else {
    renderLanguagePreferences(languagePreferencesSnapshot);
    showToast(result?.message || "保存失败");
  }
}

function selectedModelId() {
  return modelPreset.value === providerPresets.CUSTOM_MODEL_ID
    ? modelName.value.trim()
    : modelPreset.value;
}

function translatorPayload() {
  return {
    mode: "ai-precise",
    preferFree: !defaultAiTranslation.checked,
    provider: "openai-compatible",
    baseUrl: apiBaseUrl.value.trim(),
    apiKey: apiKey.value.trim(),
    model: selectedModelId()
  };
}

function setServiceStatus(message, type = "") {
  serviceStatus.textContent = message;
  serviceStatus.className = `service-status${type ? ` ${type}` : ""}`;
}

function setFreeOnlineMessage(message, type = "") {
  freeOnlineMessage.textContent = message;
  freeOnlineMessage.className = `service-status${type ? ` ${type}` : ""}`;
}

function setModelScopeMessage(message, type = "") {
  modelScopeMessage.textContent = message;
  modelScopeMessage.className = `service-status${type ? ` ${type}` : ""}`;
}

function setServiceBusy(busy) {
  serviceBusy = busy;
  updateServiceControls();
}

function updateServiceControls() {
  defaultAiTranslation.disabled = serviceBusy;
  testService.disabled = serviceBusy;
  saveService.disabled = serviceBusy;
  apiBaseUrl.disabled = serviceBusy;
  apiKey.disabled = serviceBusy;
  providerType.disabled = serviceBusy;
  modelPreset.disabled = serviceBusy;
  modelName.disabled = serviceBusy;
  aiProviderFields.hidden = false;
}

function setFreeOnlineBusy(busy) {
  freeOnlineBusy = busy;
  freeOnlineApiKey.disabled = busy;
  freeOnlineTestDirection.disabled = busy;
  freeOnlineTestText.disabled = busy;
  testFreeOnlineConnection.disabled = busy;
  testFreeOnlineTranslation.disabled = busy;
  saveFreeOnline.disabled = busy;
}

function freeOnlinePayload() {
  const [sourceLanguage, targetLanguage] = freeOnlineTestDirection.value.split(":");
  return {
    apiKey: freeOnlineApiKey.value.trim(),
    text: freeOnlineTestText.value.trim(),
    sourceLanguage,
    targetLanguage
  };
}

function setModelScopeBusy(busy) {
  modelScopeBusy = busy;
  for (const control of [modelScopeToken, modelScopeTestDirection, modelScopeTestText,
    testModelScopeConnection, testModelScopeTranslation, saveModelScope]) control.disabled = busy;
}

function modelScopePayload() {
  const [sourceLanguage, targetLanguage] = modelScopeTestDirection.value.split(":");
  return {
    token: modelScopeToken.value.trim(),
    text: modelScopeTestText.value.trim(),
    sourceLanguage,
    targetLanguage
  };
}

function applyFreeOnlineSnapshot(config = {}) {
  const freeOnline = config.freeOnline || {};
  freeOnlineApiKey.value = "";
  freeOnlineApiKey.placeholder = freeOnline.hasApiKey
    ? "已安全保存，留空表示不修改"
    : "请输入 SiliconFlow API Key";
  freeOnlineStatus.textContent = freeOnline.statusLabel || "未配置";
  freeOnlineStatus.classList.toggle("configured", Boolean(freeOnline.hasApiKey));
  setFreeOnlineMessage(freeOnline.hasApiKey ? "免费在线翻译已配置，可手动测试。" : "请填写 API Key 后保存或测试。");
  if (!freeOnlineTestText.value) freeOnlineTestText.value = "材料的选择直接影响电池性能。";
  const modelScope = freeOnline.modelScope || {};
  modelScopeToken.value = "";
  modelScopeToken.placeholder = modelScope.hasApiKey
    ? "已安全保存，留空表示不修改"
    : "请输入魔搭访问令牌";
  modelScopeStatus.textContent = modelScope.statusLabel || "未配置";
  modelScopeStatus.classList.toggle("configured", Boolean(modelScope.hasApiKey));
  setModelScopeMessage(modelScope.hasApiKey ? "访问令牌已保存，可手动测试。" : "请填写访问令牌后保存或测试。");
  if (!modelScopeTestText.value) modelScopeTestText.value = "材料的选择直接影响电池性能。";
}

function fillProviderOptions() {
  const groupMap = new Map(providerPresets.providerGroups.map((group) => {
    const optgroup = document.createElement("optgroup");
    optgroup.label = group.label;
    return [group.id, optgroup];
  }));
  for (const provider of providerPresets.providers) {
    const option = document.createElement("option");
    option.value = provider.id;
    option.textContent = provider.label;
    const group = groupMap.get(provider.group);
    if (group) group.append(option);
    else providerType.append(option);
  }
  providerType.replaceChildren(...providerPresets.providerGroups
    .map((group) => groupMap.get(group.id))
    .filter((group) => group && group.children.length > 0));
}

function fillModelOptions(provider, selectedModel = "") {
  modelPreset.replaceChildren(...provider.models.map((model) => {
    const option = document.createElement("option");
    option.value = model.id;
    option.textContent = model.label;
    return option;
  }));
  const identified = providerPresets.identifyModel(provider, selectedModel);
  modelPreset.value = identified.id;
  modelName.value = identified.id === providerPresets.CUSTOM_MODEL_ID ? selectedModel : "";
  customModelField.hidden = identified.id !== providerPresets.CUSTOM_MODEL_ID;
}

function applyTranslatorSnapshot(config) {
  defaultAiTranslation.checked = config.preferFree === false;
  apiBaseUrl.value = config.baseUrl || "";
  const provider = providerPresets.identifyProvider(config.baseUrl);
  providerType.value = provider.id;
  fillModelOptions(provider, config.model || "");
  providerNote.textContent = provider.note || "";
  providerNote.hidden = !provider.note;
  apiKey.value = "";
  apiKey.placeholder = config.hasApiKey
    ? "已安全保存，留空表示不修改"
    : "请输入 API Key";
  updateServiceControls();
  applyFreeOnlineSnapshot(config);
}

fillProviderOptions();

providerType.addEventListener("change", () => {
  const provider = providerPresets.getProvider(providerType.value);
  apiBaseUrl.value = provider.baseUrl;
  const defaultModel = provider.models.find((model) => model.id !== providerPresets.CUSTOM_MODEL_ID);
  fillModelOptions(provider, defaultModel?.id || "");
  providerNote.textContent = provider.note || "";
  providerNote.hidden = !provider.note;
  setServiceStatus("设置已修改，点击保存后生效");
});

modelPreset.addEventListener("change", () => {
  customModelField.hidden = modelPreset.value !== providerPresets.CUSTOM_MODEL_ID;
  if (!customModelField.hidden) modelName.focus();
  setServiceStatus("设置已修改，点击保存后生效");
});

function renderBallDisplayOptions(config) {
  ballDisplaySnapshot = config || { mode: "full", options: [] };
  ballDisplayOptions.replaceChildren();
  for (const option of ballDisplaySnapshot.options || []) {
    const label = document.createElement("label");
    label.className = "segment";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "ballDisplayMode";
    input.value = option.value;
    input.checked = option.value === ballDisplaySnapshot.mode;
    input.addEventListener("change", async () => {
      if (!input.checked) return;
      const result = await window.translatorSettings.saveBallDisplay({
        mode: input.value
      });
      if (result.ok) {
        renderBallDisplayOptions(result.snapshot);
        showToast("悬浮球显示已保存");
      } else {
        input.checked = option.value === ballDisplaySnapshot.mode;
        showToast(result.message || "保存失败");
      }
    });
    const text = document.createElement("span");
    text.textContent = option.label;
    label.append(input, text);
    ballDisplayOptions.append(label);
  }
}

function renderLocalModelStatus(config = {}) {
  const state = ["starting", "running", "failed"].includes(config.state) ? config.state : "stopped";
  const labels = { starting: "启动中", running: "运行中", failed: "启动失败", stopped: "未运行" };
  localModelManualHold.checked = Boolean(config.manualHold);
  localModelRuntimeStatus.className = `local-model-runtime-status ${state}`;
  localModelRuntimeStatus.querySelector("span").textContent = labels[state];
  localModelRuntimeStatus.title = state === "failed" ? (config.message || "本地模型启动失败") : "";
}

localModelManualHold.addEventListener("change", async () => {
  const requested = localModelManualHold.checked;
  localModelManualHold.disabled = true;
  try {
    const result = await window.translatorSettings.setLocalModelManualHold(requested);
    renderLocalModelStatus(result?.snapshot);
    if (!result?.ok) showToast(result?.message || "本地模型启动失败");
  } catch {
    renderLocalModelStatus({ manualHold: false, state: "failed", message: "本地模型启动失败" });
    showToast("本地模型启动失败");
  } finally {
    localModelManualHold.disabled = false;
  }
});

function renderRuntimeModeOptions(config) {
  runtimeModeSnapshot = config || { mode: "normal", options: [] };
  runtimeModeOptions.replaceChildren();
  for (const option of runtimeModeSnapshot.options || []) {
    const label = document.createElement("label");
    label.className = "segment";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "runtimeMode";
    input.value = option.value;
    input.checked = option.value === runtimeModeSnapshot.mode;
    input.addEventListener("change", async () => {
      if (!input.checked) return;
      const result = await window.translatorSettings.saveRuntimeMode({ mode: input.value });
      if (result.ok) {
        renderRuntimeModeOptions(result.snapshot);
        snapshot = await window.translatorSettings.getSnapshot();
        render();
        showToast(input.value === "game" ? "已进入游戏模式" : "已恢复日常模式");
      } else {
        renderRuntimeModeOptions(runtimeModeSnapshot);
        showToast(result.message || "模式切换失败");
      }
    });
    const text = document.createElement("span");
    text.textContent = option.label;
    label.append(input, text);
    runtimeModeOptions.append(label);
  }
}

function renderBuildInfo(info) {
  if (!buildInfo || !info) return;
  buildInfo.textContent = `${info.buildLabel || "Trans 2.0 Test"} · Build: ${info.buildTime || info.buildStamp || "dev"}`;
}

const CODE_TO_KEY = {
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Space: "Space",
  Tab: "Tab",
  Backspace: "Backspace",
  Delete: "Delete",
  Insert: "Insert",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  Escape: "Escape",
  Enter: "Enter",
  NumpadEnter: "Enter",
  Minus: "Minus",
  Comma: "Comma",
  Period: "Period",
  Slash: "Slash",
  Backslash: "Backslash",
  Semicolon: "Semicolon",
  Quote: "Quote",
  BracketLeft: "LeftBracket",
  BracketRight: "RightBracket"
};

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 1800);
}

function keyboardBindingFromEvent(event) {
  if (["Control", "Shift", "Alt", "Meta"].includes(event.key)) return null;
  let key = CODE_TO_KEY[event.code];
  if (/^Key[A-Z]$/.test(event.code)) key = event.code.slice(3);
  if (/^Digit[0-9]$/.test(event.code)) key = event.code.slice(5);
  if (/^Numpad[0-9]$/.test(event.code)) key = `num${event.code.slice(6)}`;
  if (/^F(?:[1-9]|1[0-9]|2[0-4])$/.test(event.code)) key = event.code;
  if (!key) return null;

  const modifiers = [];
  if (event.ctrlKey) modifiers.push("Control");
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey) modifiers.push("Shift");
  if (event.metaKey) modifiers.push("Super");
  return { type: "keyboard", accelerator: [...modifiers, key].join("+") };
}

function bindingLabel(binding) {
  if (binding.label) return binding.label;
  return binding.accelerator
    .split("+")
    .map((part) => {
      if (part === "Control") return "Ctrl";
      if (part === "Super") return "Win";
      if (/^num[0-9]$/.test(part)) return `小键盘 ${part.slice(-1)}`;
      return part;
    })
    .join(" + ");
}

function setCapturedBinding(binding) {
  capturedBinding = binding;
  capturedValue.textContent = bindingLabel(binding);
  captureError.textContent = "";
  confirmCapture.disabled = false;
}

function openCapture(action, bindingId = null) {
  captureContext = { action, bindingId };
  capturedBinding = null;
  capturedValue.textContent = "等待输入…";
  captureError.textContent = "";
  confirmCapture.disabled = true;
  captureOverlay.hidden = false;
  window.translatorSettings.beginCapture();
}

function closeCapture() {
  captureOverlay.hidden = true;
  captureContext = null;
  capturedBinding = null;
  window.translatorSettings.cancelCapture();
}

function render() {
  hotkeyList.replaceChildren();
  for (const action of snapshot.actions.filter((item) => item.group === activeHotkeyCategory)) {
    const row = document.createElement("div");
    row.className = "hotkey-row";
    row.dataset.action = action.id;

    const actionInfo = document.createElement("div");
    actionInfo.className = "action-info";

    const name = document.createElement("div");
    name.className = "action-name";
    name.textContent = action.name;
    actionInfo.append(name);

    if (action.recommendation) {
      const recommendation = document.createElement("div");
      recommendation.className = "action-recommendation";
      recommendation.textContent = action.recommendation;
      actionInfo.append(recommendation);
    }

    const bindings = document.createElement("div");
    bindings.className = "bindings";
    if (action.bindings.length === 0) {
      const empty = document.createElement("span");
      empty.className = "empty-binding";
      empty.textContent = "未设置";
      bindings.append(empty);
    }

    for (const binding of action.bindings) {
      const item = document.createElement("div");
      item.className = `binding${binding.active === false && !binding.inactiveForMode ? " inactive" : ""}`;
      if (binding.error) item.title = binding.error;

      const label = document.createElement("span");
      label.className = "binding-label";
      label.textContent = binding.label;

      const edit = document.createElement("button");
      edit.type = "button";
      edit.textContent = "修改";
      edit.addEventListener("click", () => openCapture(action.id, binding.id));

      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "删除";
      remove.addEventListener("click", async () => {
        const result = await window.translatorSettings.deleteBinding({
          action: action.id,
          bindingId: binding.id
        });
        if (result.ok) {
          snapshot = result.snapshot;
          render();
          showToast("绑定已删除");
        } else {
          showToast(result.message);
        }
      });

      item.append(label, edit, remove);
      bindings.append(item);
    }

    const add = document.createElement("button");
    add.type = "button";
    add.className = "add-button";
    add.textContent = "添加绑定";
    add.addEventListener("click", () => openCapture(action.id));

    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "secondary-button reset-action-button";
    reset.textContent = "恢复默认";
    reset.addEventListener("click", async () => {
      const result = await window.translatorSettings.resetAction({ action: action.id });
      if (result.ok) {
        snapshot = result.snapshot;
        render();
        showToast(`已恢复“${action.name}”的默认键位`);
      } else {
        showToast(result.message);
      }
    });

    const rowActions = document.createElement("div");
    rowActions.className = "hotkey-row-actions";
    rowActions.append(add, reset);

    row.append(actionInfo, bindings, rowActions);
    hotkeyList.append(row);
  }
}

for (const tab of document.querySelectorAll(".primary-tab")) {
  tab.addEventListener("click", () => {
    window.translatorSettings.closeOverlayPreview();
    closeColorPalette();
    document.querySelectorAll(".primary-tab").forEach((item) => item.classList.toggle("active", item === tab));
    document.querySelectorAll(".settings-page").forEach((panel) => panel.classList.toggle("active", panel.dataset.pagePanel === tab.dataset.page));
    if (tab.dataset.page === "appearance") refreshNetworkStatus();
  });
}

for (const tab of document.querySelectorAll(".category-tab")) {
  tab.addEventListener("click", () => {
    activeHotkeyCategory = tab.dataset.hotkeyCategory;
    document.querySelectorAll(".category-tab").forEach((item) => item.classList.toggle("active", item === tab));
    render();
  });
}

for (const tab of document.querySelectorAll(".service-tab")) {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".service-tab").forEach((item) => item.classList.toggle("active", item === tab));
    document.querySelectorAll(".service-panel").forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.serviceContent === tab.dataset.servicePanel);
    });
  });
}

for (const control of directionControls) {
  control.querySelectorAll("select").forEach((select) => {
    select.addEventListener("change", () => saveDirection(control));
  });
}
for (const control of sceneMethodControls) {
  control.addEventListener("change", () => saveSceneMethod(control));
}

gameFullscreenDuration.addEventListener("blur", () => {
  const numeric = Number(gameFullscreenDuration.value);
  gameFullscreenDuration.value = Math.min(10, Math.max(0.5, Number.isFinite(numeric) ? numeric : 5)).toFixed(1);
});

for (const [key, control] of Object.entries(overlayStyleControls)) {
  const mode = OVERLAY_POSITION_KEYS.includes(key) ? "position" : "style";
  control.addEventListener("input", () => updateOverlayStylePreview({ mode }));
  control.addEventListener("pointerdown", () => updateOverlayStylePreview({ mode }));
}
for (const button of document.querySelectorAll(".color-swatch")) {
  const input = document.getElementById(button.dataset.colorTarget);
  button.addEventListener("click", (event) => { event.stopPropagation(); openColorPalette(button, input); });
}
function selectPalettePoint(event) {
  const selection = colorPicker.boardSelection(event.clientX, event.clientY, paletteBoard.getBoundingClientRect());
  paletteSaturation = selection.saturation;
  paletteValue = selection.value;
  updatePaletteColor(colorPicker.hsvToHex(paletteHue.value, paletteSaturation, paletteValue));
}
paletteBoard.addEventListener("pointerdown", (event) => {
  paletteDragging = true;
  paletteBoard.setPointerCapture?.(event.pointerId);
  selectPalettePoint(event);
});
paletteBoard.addEventListener("pointermove", (event) => { if (paletteDragging) selectPalettePoint(event); });
paletteBoard.addEventListener("pointerup", (event) => { paletteDragging = false; paletteBoard.releasePointerCapture?.(event.pointerId); });
paletteBoard.addEventListener("pointercancel", () => { paletteDragging = false; });
paletteHue.addEventListener("input", () => updatePaletteColor(colorPicker.hsvToHex(paletteHue.value, paletteSaturation, paletteValue)));
paletteHex.addEventListener("input", () => {
  const raw = paletteHex.value.trim();
  const normalized = raw.startsWith("#") ? raw : `#${raw}`;
  if (/^#[0-9a-f]{6}$/i.test(normalized)) {
    const hsv = colorPicker.hexToHsv(normalized);
    [paletteHue.value, paletteSaturation, paletteValue] = hsv;
    updatePaletteColor(normalized);
  }
});
colorPalette.addEventListener("pointerdown", (event) => event.stopPropagation());
document.addEventListener("pointerdown", (event) => {
  if (!colorPalette.hidden && !colorPalette.contains(event.target) && !event.target.closest(".color-swatch")) closeColorPalette();
  if (!event.target.closest(".overlay-style-card, .position-animation-group, #colorPalette")) window.translatorSettings.closeOverlayPreview();
}, true);
overlayStyleScope.addEventListener("change", () => {
  commitOverlayControls();
  activeOverlayScope = overlayStyleScope.value;
  renderOverlayStyles(overlayStylesSnapshot);
  updateOverlayStylePreview({ mode: "style" });
});
shareOverlayStyles.addEventListener("change", () => {
  commitOverlayControls();
  renderOverlayStyles({ ...overlayStylesSnapshot, shareStyles: shareOverlayStyles.checked });
  updateOverlayStylePreview({ mode: "style" });
});
shareOverlayPositionAnimation.addEventListener("change", () => {
  commitOverlayControls();
  renderOverlayStyles({ ...overlayStylesSnapshot, sharePositionAnimation: shareOverlayPositionAnimation.checked });
  updateOverlayStylePreview({ mode: "position" });
});
document.getElementById("resetOverlayStyle").addEventListener("click", () => {
  const defaults = { fontFamily: "Microsoft YaHei UI", fontSize: 17, fontWeight: 700, textColor: "#fff7df", textOpacity: 1, outline: true, outlineColor: "#231713", backgroundColor: "#000000", backgroundOpacity: 0, position: "near-source", offsetX: 0, offsetY: 0, fade: true, animationDurationMs: 160 };
  overlayStylesSnapshot = { shareStyles: true, sharePositionAnimation: true, fullscreen: { ...defaults }, region: { ...defaults }, regionRefreshIntervalMs: 1600, regionOverlayDurationMs: 1200 };
  overlayStyleScope.value = "fullscreen";
  activeOverlayScope = "fullscreen";
  renderOverlayStyles(overlayStylesSnapshot);
  gameFullscreenDuration.value = "5.0";
  updateOverlayStylePreview();
});
function validatedTimingSettings({ normalize = true } = {}) {
  const enteredRefresh = Number(regionRefreshInterval.value);
  const refreshSeconds = Math.round(Math.min(15, Math.max(1, Number.isFinite(enteredRefresh) ? enteredRefresh : 1.6)) * 10) / 10;
  const maximumDuration = Math.round((refreshSeconds - 0.1) * 10) / 10;
  regionOverlayDuration.max = maximumDuration.toFixed(1);
  const enteredDuration = Number(regionOverlayDuration.value);
  const durationSeconds = Math.round(Math.min(maximumDuration, Math.max(0.1, Number.isFinite(enteredDuration) ? enteredDuration : Math.min(1.2, maximumDuration))) * 10) / 10;
  timingValidationMessage.textContent = "";
  if (normalize) {
    regionRefreshInterval.value = refreshSeconds.toFixed(1);
    regionOverlayDuration.value = durationSeconds.toFixed(1);
  } else if (Number.isFinite(enteredRefresh) && enteredRefresh >= 1 && enteredRefresh <= 15 && Number.isFinite(enteredDuration) && enteredDuration > maximumDuration) {
    regionOverlayDuration.value = maximumDuration.toFixed(1);
  }
  return { regionRefreshIntervalMs: Math.round(refreshSeconds * 1000), regionOverlayDurationMs: Math.round(durationSeconds * 1000) };
}
regionRefreshInterval.addEventListener("input", () => validatedTimingSettings({ normalize: false }));
regionRefreshInterval.addEventListener("change", () => validatedTimingSettings());
regionOverlayDuration.addEventListener("change", () => validatedTimingSettings());
document.getElementById("saveOverlayStyle").addEventListener("click", async () => {
  const timing = validatedTimingSettings();
  if (!timing) { showToast("请先修正译文时间设置"); return; }
  commitOverlayControls();
  const next = {
    ...overlayStylesSnapshot,
    ...timing,
    shareStyles: shareOverlayStyles.checked,
    sharePositionAnimation: shareOverlayPositionAnimation.checked
  };
  const [result, durationResult] = await Promise.all([
    window.translatorSettings.saveOverlayStyles(next),
    window.translatorSettings.saveGameFullscreenDuration(Number(gameFullscreenDuration.value))
  ]);
  if (result?.ok && durationResult?.ok) {
    renderOverlayStyles(result.snapshot);
    renderLanguagePreferences(durationResult.snapshot);
    window.translatorSettings.closeOverlayPreview();
    showToast("游戏译文设置已保存");
  } else showToast(result?.message || durationResult?.message || "保存失败");
});

async function refreshNetworkStatus() {
  if (!networkStatus) return;
  networkStatus.className = "network-status unknown";
  networkStatus.querySelector("span").textContent = "正在检测";
  try {
    const result = await window.translatorSettings.checkNetwork();
    networkStatus.className = `network-status ${result.status || "unknown"}`;
    networkStatus.querySelector("span").textContent = result.label || "状态未知";
  } catch { networkStatus.querySelector("span").textContent = "状态未知"; }
}

window.addEventListener("online", refreshNetworkStatus);
window.addEventListener("offline", refreshNetworkStatus);
networkTimer = window.setInterval(refreshNetworkStatus, 30000);
window.addEventListener("beforeunload", () => window.clearInterval(networkTimer));

window.addEventListener("keydown", (event) => {
  if (captureOverlay.hidden || event.repeat) return;
  event.preventDefault();
  event.stopPropagation();
  const binding = keyboardBindingFromEvent(event);
  if (binding) setCapturedBinding(binding);
});

confirmCapture.addEventListener("click", async () => {
  if (!captureContext || !capturedBinding) return;
  const result = await window.translatorSettings.saveBinding({
    ...captureContext,
    binding: capturedBinding
  });
  if (!result.ok) {
    captureError.textContent = result.message;
    return;
  }
  snapshot = result.snapshot;
  captureOverlay.hidden = true;
  captureContext = null;
  capturedBinding = null;
  render();
  showToast("绑定已保存");
});

document.getElementById("cancelCapture").addEventListener("click", closeCapture);

defaultAiTranslation.addEventListener("change", () => {
  setServiceStatus("设置已修改，点击保存后生效");
});

testService.addEventListener("click", async () => {
  setServiceBusy(true);
  setServiceStatus("正在测试连接…");
  try {
    const result = await window.translatorSettings.testTranslator(
      translatorPayload()
    );
    setServiceStatus(result.message, result.ok ? "success" : "error");
  } catch {
    setServiceStatus("网络连接失败", "error");
  } finally {
    setServiceBusy(false);
  }
});

saveService.addEventListener("click", async () => {
  setServiceBusy(true);
  setServiceStatus("正在保存…");
  try {
    const result = await window.translatorSettings.saveTranslator(
      translatorPayload()
    );
    setServiceStatus(result.message, result.ok ? "success" : "error");
    if (result.ok) applyTranslatorSnapshot(result.snapshot);
  } catch {
    setServiceStatus("保存失败", "error");
  } finally {
    setServiceBusy(false);
  }
});

saveFreeOnline.addEventListener("click", async () => {
  setFreeOnlineBusy(true);
  setFreeOnlineMessage("正在保存…");
  try {
    const result = await window.translatorSettings.saveFreeOnline(
      freeOnlinePayload()
    );
    setFreeOnlineMessage(result.message, result.ok ? "success" : "error");
    if (result.ok) applyTranslatorSnapshot(result.snapshot);
  } catch {
    setFreeOnlineMessage("保存失败", "error");
  } finally {
    setFreeOnlineBusy(false);
  }
});

testFreeOnlineConnection.addEventListener("click", async () => {
  setFreeOnlineBusy(true);
  setFreeOnlineMessage("正在测试连接…");
  try {
    const result = await window.translatorSettings.testFreeOnlineConnection(
      freeOnlinePayload()
    );
    const suffix = result.ok && Number.isFinite(result.responseTimeMs)
      ? ` · ${Math.round(result.responseTimeMs)} ms`
      : "";
    setFreeOnlineMessage(`${result.message}${suffix}`, result.ok ? "success" : "error");
  } catch {
    setFreeOnlineMessage("网络连接失败", "error");
  } finally {
    setFreeOnlineBusy(false);
  }
});

testFreeOnlineTranslation.addEventListener("click", async () => {
  setFreeOnlineBusy(true);
  setFreeOnlineMessage("正在测试翻译…");
  freeOnlineTestResult.hidden = true;
  try {
    const result = await window.translatorSettings.testFreeOnlineTranslation(
      freeOnlinePayload()
    );
    if (result.ok) {
      const elapsed = Number.isFinite(result.responseTimeMs)
        ? `${(result.responseTimeMs / 1000).toFixed(2)} 秒`
        : "未记录";
      freeOnlineTestResult.textContent =
        `译文：\n${result.text}\n\n响应时间：${elapsed}\n实际模型：${result.model}`;
      freeOnlineTestResult.hidden = false;
      setFreeOnlineMessage("测试翻译成功", "success");
    } else {
      setFreeOnlineMessage(result.message || "测试翻译失败", "error");
    }
  } catch {
    setFreeOnlineMessage("测试翻译失败", "error");
  } finally {
    setFreeOnlineBusy(false);
  }
});

saveModelScope.addEventListener("click", async () => {
  setModelScopeBusy(true);
  setModelScopeMessage("正在保存…");
  try {
    const result = await window.translatorSettings.saveModelScope(modelScopePayload());
    setModelScopeMessage(result.message, result.ok ? "success" : "error");
    if (result.ok) applyTranslatorSnapshot(result.snapshot);
  } catch {
    setModelScopeMessage("保存失败", "error");
  } finally {
    setModelScopeBusy(false);
  }
});

testModelScopeConnection.addEventListener("click", async () => {
  setModelScopeBusy(true);
  setModelScopeMessage("正在测试连接…");
  try {
    const result = await window.translatorSettings.testModelScopeConnection(modelScopePayload());
    const suffix = result.ok && Number.isFinite(result.responseTimeMs)
      ? ` · ${Math.round(result.responseTimeMs)} ms`
      : "";
    setModelScopeMessage(`${result.message}${suffix}`, result.ok ? "success" : "error");
  } catch {
    setModelScopeMessage("网络连接失败", "error");
  } finally {
    setModelScopeBusy(false);
  }
});

testModelScopeTranslation.addEventListener("click", async () => {
  setModelScopeBusy(true);
  setModelScopeMessage("正在测试翻译…");
  modelScopeTestResult.hidden = true;
  try {
    const result = await window.translatorSettings.testModelScopeTranslation(modelScopePayload());
    if (result.ok) {
      const elapsed = Number.isFinite(result.responseTimeMs)
        ? `${(result.responseTimeMs / 1000).toFixed(2)} 秒`
        : "未记录";
      modelScopeTestResult.textContent =
        `译文：\n${result.text}\n\n响应时间：${elapsed}\n实际模型：${result.model}`;
      modelScopeTestResult.hidden = false;
      setModelScopeMessage("测试翻译成功", "success");
    } else {
      setModelScopeMessage(result.message || "测试翻译失败", "error");
    }
  } catch {
    setModelScopeMessage("测试翻译失败", "error");
  } finally {
    setModelScopeBusy(false);
  }
});

document.getElementById("quitTranslator").addEventListener("click", () => {
  window.translatorSettings.quitTranslator();
});

document.getElementById("minimizeButton").addEventListener("click", () => {
  window.translatorSettings.minimize();
});

document.getElementById("closeButton").addEventListener("click", () => {
  window.translatorSettings.close();
});

Promise.all([
  window.translatorSettings.getSnapshot(),
  window.translatorSettings.getTranslatorConfig(),
  window.translatorSettings.getBallDisplay(),
  window.translatorSettings.getRuntimeMode(),
  window.translatorSettings.getLocalModelStatus(),
  window.translatorSettings.getLanguagePreferences(),
  window.translatorSettings.getOverlayStyles(),
  window.translatorSettings.getBuildInfo()
]).then(([hotkeySnapshot, translatorConfig, ballDisplayConfig, runtimeModeConfig, localModelStatus, languagePreferences, overlayStyles, appBuildInfo]) => {
  snapshot = hotkeySnapshot;
  render();
  applyTranslatorSnapshot(translatorConfig);
  renderBallDisplayOptions(ballDisplayConfig);
  renderRuntimeModeOptions(runtimeModeConfig);
  renderLocalModelStatus(localModelStatus);
  renderLanguagePreferences(languagePreferences);
  renderOverlayStyles(overlayStyles);
  renderBuildInfo(appBuildInfo);
  refreshNetworkStatus();
});

window.translatorSettings.onRuntimeModeChanged((config) => {
  renderRuntimeModeOptions(config);
  window.translatorSettings.getSnapshot().then((next) => { snapshot = next; render(); });
});

window.translatorSettings.onLocalModelStatusChanged(renderLocalModelStatus);

window.translatorSettings.onLanguagePreferencesChanged(renderLanguagePreferences);

const automaticMethod = document.getElementById("defaultTranslationMethod");
const allowPaidApi = document.getElementById("allowPaidApi");
const freeServiceList = document.getElementById("freeServiceList");
const freeBenchmarkOverlay = document.getElementById("freeBenchmarkOverlay");
const benchmarkDirection = document.getElementById("benchmarkDirection");
const benchmarkTextType = document.getElementById("benchmarkTextType");
const benchmarkText = document.getElementById("benchmarkText");
const benchmarkResults = document.getElementById("benchmarkResults");
const benchmarkMessage = document.getElementById("benchmarkMessage");
const startFreeBenchmark = document.getElementById("startFreeBenchmark");
const BENCHMARK_TEXTS = Object.freeze({
  short: "材料的选择直接影响到电池的性能。",
  long: "在能源储存系统中，材料的组成、微观结构和界面稳定性共同决定电池的容量、循环寿命与安全性能。实验结果表明，该催化剂在 24 h 连续运行后仍保持较高活性，并且没有出现明显的结构衰减。"
});
const BENCHMARK_LABELS = Object.freeze({
  siliconflow: "硅基流动 SiliconFlow",
  modelscope: "魔搭社区 ModelScope",
  baidu: "百度翻译",
  aliyun: "阿里云机器翻译"
});

function renderBenchmarkSummary(benchmarks = {}) {
  for (const provider of Object.keys(BENCHMARK_LABELS)) {
    const target = document.querySelector(`.free-service-row[data-provider="${provider}"] .benchmark-result`);
    const result = benchmarks[provider];
    if (!target) continue;
    target.textContent = Number.isFinite(result?.elapsedMs) ? `${result.elapsedMs} ms` : "未测速";
    target.className = `benchmark-result${Number.isFinite(result?.elapsedMs) ? " success" : ""}`;
  }
}

function renderBenchmarkResults(results = {}) {
  benchmarkResults.replaceChildren(...Object.entries(BENCHMARK_LABELS).map(([provider, label]) => {
    const result = results[provider] || { status: "pending" };
    const row = document.createElement("div");
    row.className = "benchmark-result-row";
    const name = document.createElement("strong");
    name.textContent = label;
    const value = document.createElement("span");
    value.textContent = result.status === "success" ? `${result.elapsedMs} ms`
      : result.status === "unconfigured" ? "未配置"
        : result.status === "failed" ? "测速失败" : "等待测速";
    row.append(name, value);
    if (result.status === "failed") {
      const details = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = "查看错误详情";
      const detailText = document.createElement("pre");
      detailText.textContent = [result.code, result.message, result.details?.message]
        .filter(Boolean).join(" · ");
      details.append(summary, detailText);
      row.append(details);
    }
    return row;
  }));
}

function applyAutomaticSettings(config) {
  if (!config) return;
  const method = automaticMethod?.querySelector(`input[value="${config.defaultTranslationMethod || "free-online"}"]`);
  if (method) method.checked = true;
  if (allowPaidApi) allowPaidApi.checked = config.allowPaidApi === true;
  document.querySelectorAll('input[name="preferredFreeProvider"]').forEach((input) => {
    input.checked = input.value === (config.preferredFreeProvider || "siliconflow");
    input.closest(".free-service-row")?.classList.toggle("preferred", input.checked);
  });
  const free = config.freeOnline || {};
  const statusByProvider = {
    siliconflow: { configured: free.hasApiKey, connection: config.connectionStatus?.siliconflow },
    modelscope: { configured: free.modelScope?.hasApiKey, connection: config.connectionStatus?.modelscope },
    baidu: { configured: free.baidu?.hasApiKey, connection: config.connectionStatus?.baidu },
    aliyun: { configured: free.aliyun?.hasApiKey, connection: config.connectionStatus?.aliyun }
  };
  for (const [provider, state] of Object.entries(statusByProvider)) {
    const row = document.querySelector(`.free-service-row[data-provider="${provider}"]`);
    if (!row) continue;
    row.querySelector(".saved-state").textContent = state.configured ? "\u5df2\u4fdd\u5b58" : "\u672a\u914d\u7f6e";
    const dot = row.querySelector(".connection-dot");
    dot.className = `connection-dot ${state.connection || "unknown"}`;
  }
  renderBenchmarkSummary(config.freeProviderBenchmarks || {});
}

function updateBenchmarkText() {
  if (benchmarkTextType.value !== "custom") benchmarkText.value = BENCHMARK_TEXTS[benchmarkTextType.value];
}

document.getElementById("openFreeBenchmark")?.addEventListener("click", () => {
  updateBenchmarkText();
  renderBenchmarkResults();
  benchmarkMessage.textContent = "只测试已配置的服务，不会改变首选服务。";
  freeBenchmarkOverlay.hidden = false;
});
document.getElementById("closeFreeBenchmark")?.addEventListener("click", () => {
  freeBenchmarkOverlay.hidden = true;
});
benchmarkTextType?.addEventListener("change", updateBenchmarkText);
startFreeBenchmark?.addEventListener("click", async () => {
  const [sourceLanguage, targetLanguage] = benchmarkDirection.value.split(":");
  const text = benchmarkText.value.trim();
  if (!text) { benchmarkMessage.textContent = "请输入测速文字。"; return; }
  startFreeBenchmark.disabled = true;
  benchmarkMessage.textContent = "正在依次测速，请稍候…";
  renderBenchmarkResults();
  try {
    const result = await window.translatorSettings.benchmarkFreeServices({
      text, sourceLanguage, targetLanguage, textType: benchmarkTextType.value
    });
    if (!result?.ok) { benchmarkMessage.textContent = result?.message || "测速失败"; return; }
    renderBenchmarkResults(result.results);
    renderBenchmarkSummary(result.benchmarks);
    benchmarkMessage.textContent = "测速完成。结果仅供比较，不会自动更改首选服务。";
  } finally {
    startFreeBenchmark.disabled = false;
  }
});

async function saveAutomaticSettings() {
  const result = await window.translatorSettings.saveAutomaticTranslation({
    defaultTranslationMethod: automaticMethod.querySelector('input:checked')?.value || "free-online",
    allowPaidApi: allowPaidApi.checked,
    preferredFreeProvider: document.querySelector('input[name="preferredFreeProvider"]:checked')?.value || "siliconflow"
  });
  if (result?.ok) applyAutomaticSettings(result.snapshot);
  showToast(result?.message || "\u4fdd\u5b58\u5931\u8d25");
}

automaticMethod?.addEventListener("change", saveAutomaticSettings);
allowPaidApi?.addEventListener("change", saveAutomaticSettings);
freeServiceList?.addEventListener("change", (event) => {
  if (event.target.name === "preferredFreeProvider") saveAutomaticSettings();
});
freeServiceList?.addEventListener("click", (event) => {
  const open = event.target.closest("[data-open-service]");
  const guide = event.target.closest("[data-guide-service]");
  if (open) window.translatorSettings.openServiceSettings({ service: open.dataset.openService, tab: "config" });
  if (guide) window.translatorSettings.openServiceSettings({ service: guide.dataset.guideService, tab: "guide" });
});

const networkRow = networkStatus?.closest(".setting-row");
networkRow?.classList.add("network-fixed");
window.translatorSettings.getTranslatorConfig().then(applyAutomaticSettings);
window.translatorSettings.onTranslatorSettingsChanged(applyAutomaticSettings);
