const sourceLanguage = document.getElementById("sourceLanguage");
const targetLanguage = document.getElementById("targetLanguage");
const sourceText = document.getElementById("sourceText");
const resultText = document.getElementById("resultText");
const statusText = document.getElementById("statusText");
const translateButton = document.getElementById("translateButton");
const copyButton = document.getElementById("copyButton");
const copyFeedback = document.getElementById("copyFeedback");
const pinButton = document.getElementById("pinButton");
const translationSource = document.getElementById("translationSource");

let activeRequestId = null;
let activeSourceVersion = 0;
let sourceVersion = 0;
let translatedValue = "";
let streamedValue = "";
let composing = false;
let pinned = false;
let copyTimer = null;
let selectedSource = "local_qwen";
let sourceLabels = new Map();
let activeRequestSource = null;

function providerLabel(result) {
  if (result?.provider === "passthrough") return "未调用模型";
  if (result?.providerLabel) return result.providerLabel;
  if (activeRequestSource === "local_qwen") return "Qwen3-4B";
  if (activeRequestSource === "free_online" || activeRequestSource === "free_siliconflow") {
    return "硅基流动 · Hunyuan-MT-7B";
  }
  if (activeRequestSource === "free_modelscope") return "魔搭社区 · Ling-3.0-flash";
  if (activeRequestSource === "free_baidu") return "百度翻译 · 通用 API";
  if (activeRequestSource === "free_aliyun") return "阿里云机器翻译 · 通用版";
  return "AI 精译";
}

function setStatus(message, error = false) {
  statusText.textContent = message;
  statusText.classList.toggle("error", error);
}

function setResult(text, state = "result") {
  translatedValue = state === "result" ? text : "";
  resultText.textContent = text;
  resultText.classList.toggle("empty", state === "empty");
  resultText.classList.toggle("loading", state === "loading");
  resultText.classList.toggle("error", state === "error");
  copyButton.disabled = !translatedValue;
}

function setBusy(busy) {
  translateButton.disabled = busy;
  translateButton.textContent = busy ? "翻译中…" : "翻译";
  translationSource.disabled = busy;
}

function cancelActive() {
  if (activeRequestId) window.localTranslate.cancel(activeRequestId);
  activeRequestId = null;
  setBusy(false);
}

async function translate() {
  const text = sourceText.value;
  if (!text.trim()) {
    cancelActive();
    setResult("", "empty");
    setStatus("请先输入需要翻译的内容。", true);
    return;
  }
  if (activeRequestId) return;

  const requestId = crypto.randomUUID();
  const requestSource = selectedSource;
  activeRequestId = requestId;
  activeRequestSource = requestSource;
  activeSourceVersion = sourceVersion;
  streamedValue = "";
  setBusy(true);
  setResult("正在翻译…", "loading");
  const selectedLabel = sourceLabels.get(requestSource) || "翻译服务";
  setStatus(sourceLanguage.value === targetLanguage.value
    ? "正在处理…"
    : requestSource === "local_qwen"
      ? "正在启动本地模型…"
      : `正在翻译 · ${selectedLabel}`);

  try {
    const pendingResult = window.localTranslate.translate({
      requestId,
      text,
      sourceLanguage: sourceLanguage.value,
      targetLanguage: targetLanguage.value,
      source: requestSource
    });
    if (requestSource === "ai_api") {
      selectedSource = "local_qwen";
      translationSource.value = selectedSource;
    }
    const result = await pendingResult;
    if (activeRequestId !== requestId || activeSourceVersion !== sourceVersion) return;
    if (result.ok) {
      setResult(result.text, "result");
      setStatus(result.provider === "passthrough"
        ? "已原样输出 · 未调用模型"
        : result.provider === "qwen-local" && Array.isArray(result.warnings) && result.warnings.length > 0
          ? `翻译完成 · ${providerLabel(result)} · 本地翻译结果可能存在偏差，请核对原文。`
        : `翻译完成 · ${providerLabel(result)}`);
    } else if (result.code !== "translation-cancelled") {
      setResult(result.message || "翻译失败", "error");
      setStatus(result.message || "翻译失败", true);
    }
  } catch {
    if (activeRequestId !== requestId || activeSourceVersion !== sourceVersion) return;
    setResult("翻译失败，请稍后重试。", "error");
    setStatus("翻译失败，请稍后重试。", true);
  } finally {
    if (activeRequestId === requestId) {
      activeRequestId = null;
      activeRequestSource = null;
      setBusy(false);
    }
  }
}

function fillLanguages(languages, selectedSource, selectedTarget) {
  for (const language of languages) {
    sourceLanguage.add(new Option(language.label, language.id));
    targetLanguage.add(new Option(language.label, language.id));
  }
  sourceLanguage.value = selectedSource;
  targetLanguage.value = selectedTarget;
}

function renderPinned(nextPinned) {
  pinned = Boolean(nextPinned);
  pinButton.setAttribute("aria-pressed", String(pinned));
  pinButton.setAttribute("aria-label", pinned ? "取消置顶" : "置顶窗口");
  pinButton.title = pinned ? "取消置顶" : "置顶窗口";
}

sourceText.addEventListener("compositionstart", () => { composing = true; });
sourceText.addEventListener("compositionend", () => { composing = false; });
sourceText.addEventListener("input", () => {
  sourceVersion += 1;
  if (activeRequestId) {
    cancelActive();
    setResult("", "empty");
  }
  setStatus(sourceText.value ? "原文已修改" : "");
});
sourceText.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing || composing || event.keyCode === 229) return;
  event.preventDefault();
  translate();
});

function isTextEntryTarget(target) {
  return target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement ||
    target?.isContentEditable;
}

document.addEventListener("pointerdown", (event) => {
  if (isTextEntryTarget(event.target)) return;
  if (isTextEntryTarget(document.activeElement)) document.activeElement.blur();
  document.body.focus({ preventScroll: true });
}, true);

window.addEventListener("keydown", async (event) => {
  if (
    event.repeat ||
    event.ctrlKey ||
    event.altKey ||
    event.shiftKey ||
    event.metaKey ||
    event.key.toLowerCase() !== "d" ||
    isTextEntryTarget(event.target)
  ) return;
  event.preventDefault();
  await window.localTranslate.toggleAllPinned();
});

for (const selector of [sourceLanguage, targetLanguage]) {
  selector.addEventListener("change", () => {
    sourceVersion += 1;
    if (activeRequestId) {
      cancelActive();
      setResult("", "empty");
    }
    setStatus("语言方向已更改");
    void window.localTranslate.saveLanguages({
      sourceLanguage: sourceLanguage.value,
      targetLanguage: targetLanguage.value
    });
  });
}

translationSource.addEventListener("change", () => {
  selectedSource = translationSource.value;
  sourceVersion += 1;
  if (activeRequestId) cancelActive();
  const label = sourceLabels.get(selectedSource) || "翻译来源";
  setStatus(`已选择 · ${label}`);
  if (selectedSource !== "ai_api") void window.localTranslate.saveSource(selectedSource);
});

translateButton.addEventListener("click", translate);
copyButton.addEventListener("click", async () => {
  if (!translatedValue) return;
  const copied = await window.localTranslate.copy(translatedValue);
  copyFeedback.textContent = copied ? "已复制" : "复制失败";
  window.clearTimeout(copyTimer);
  copyTimer = window.setTimeout(() => { copyFeedback.textContent = ""; }, 1800);
});
pinButton.addEventListener("click", async () => {
  pinButton.disabled = true;
  try { renderPinned(await window.localTranslate.setPinned(!pinned)); }
  finally { pinButton.disabled = false; }
});
document.getElementById("closeButton").addEventListener("click", () => window.localTranslate.close());

window.localTranslate.onChunk(({ requestId, delta }) => {
  if (requestId !== activeRequestId || activeSourceVersion !== sourceVersion || typeof delta !== "string") return;
  streamedValue += delta;
  setResult(streamedValue, "result");
});
window.localTranslate.onStatus(({ requestId, status }) => {
  if (requestId !== activeRequestId) return;
  if (status?.stage === "starting") {
    setResult("正在启动本地翻译模型…", "loading");
    setStatus("正在启动本地模型…");
  } else if (status?.stage === "translating") {
    if (!streamedValue) setResult("正在翻译…", "loading");
    const label = activeRequestSource === "local_qwen" ? "Qwen3-4B" : (sourceLabels.get(activeRequestSource) || "AI 精译");
    setStatus(`正在翻译 · ${label}`);
  }
});
window.localTranslate.onPinState(renderPinned);

window.localTranslate.bootstrap().then((bootstrap) => {
  document.body.dataset.mode = bootstrap?.mode === "game" ? "game" : "normal";
  fillLanguages(bootstrap?.languages || [], bootstrap?.sourceLanguage || "zh-CN", bootstrap?.targetLanguage || "en");
  for (const source of bootstrap?.sources || []) {
    const option = new Option(source.available === false ? `${source.label}（暂未接入）` : source.label, source.id);
    option.disabled = source.available === false;
    translationSource.add(option);
    sourceLabels.set(source.id, source.id === "ai_api" && bootstrap?.ai?.model
      ? bootstrap.ai.model
      : source.id === "free_online" || source.id === "free_siliconflow"
        ? "硅基流动 · Hunyuan-MT-7B"
        : source.id === "free_modelscope"
          ? "魔搭社区 · Ling-3.0-flash"
          : source.label);
  }
  selectedSource = bootstrap?.selectedSource || "local_qwen";
  translationSource.value = selectedSource;
  renderPinned(bootstrap?.pinned);
  sourceText.value = "";
  setResult("", "empty");
  setStatus("等待翻译 · 本地模型");
  document.body.focus({ preventScroll: true });
});
