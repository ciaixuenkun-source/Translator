const workspace = document.getElementById("translationWorkspace");
const sourcePane = document.getElementById("sourcePane");
const sourceText = document.getElementById("sourceText");
const splitter = document.getElementById("splitter");
const translatedText = document.getElementById("translatedText");
const statusText = document.getElementById("statusText");
const retryButton = document.getElementById("retryButton");
const pinButton = document.getElementById("pinButton");
const translationMode = document.getElementById("translationMode");
const directionText = document.getElementById("directionText");

let activeRequestId = null;
let streamedText = "";
let pinned = false;
let applyingClipboard = false;
let sourceHeight = 104;
let dragStartY = 0;
let dragStartHeight = 0;
let selectedMode = "free";
let providerLabels = { auto: "自动选择", free: "免费在线", "ai-precise": "AI 精译", local: "Qwen3-4B 本地模型" };

function renderPinnedState(nextPinned) {
  pinned = Boolean(nextPinned);
  pinButton.setAttribute("aria-pressed", String(pinned));
  pinButton.setAttribute("aria-label", pinned ? "取消固定" : "固定窗口");
  pinButton.title = pinned ? "取消固定" : "固定窗口";
}

function isTextEntryTarget(target) {
  return target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target?.isContentEditable;
}

function setPhase(phase) {
  window.textTranslation.setPhase(phase);
}

function setStatus(message, { error = false, retry = false } = {}) {
  statusText.textContent = message;
  statusText.classList.toggle("error", error);
  retryButton.hidden = !retry;
}

function setOutput(text, mode = "result") {
  translatedText.textContent = text;
  translatedText.classList.toggle("waiting", mode !== "result");
  translatedText.classList.toggle("loading", mode === "loading");
}

async function translateSource({ replaceActive = false } = {}) {
  const text = sourceText.value.trim();
  if (!text) {
    if (activeRequestId) window.textTranslation.cancel(activeRequestId);
    activeRequestId = null;
    setOutput("等待译文", "waiting");
    setStatus("剪贴板中没有可翻译文字");
    setPhase("idle");
    return;
  }

  const requestId = crypto.randomUUID();
  if (activeRequestId) window.textTranslation.cancel(activeRequestId);
  activeRequestId = requestId;
  streamedText = "";
  setOutput("正在翻译…", "loading");
  setStatus("正在翻译…");
  setPhase("translating");

  try {
    const result = await window.textTranslation.translate({
      requestId,
      text,
      mode: selectedMode,
      replaceActive
    });
    if (activeRequestId !== requestId) return;

    if (result.ok) {
      setOutput(result.text, "result");
      if (result.provider === "qwen-local" && Array.isArray(result.warnings) && result.warnings.length > 0) {
        setStatus(`翻译完成 · ${result.providerLabel || providerLabels[selectedMode]} · 本地翻译结果可能存在偏差，请核对原文。`, { error: true });
      } else {
        setStatus(`翻译完成 · ${result.providerLabel || providerLabels[selectedMode]}`);
      }
      setPhase("complete");
    } else if (result.code === "translation-cancelled") {
      setStatus("翻译已取消", { retry: true });
      setPhase("error");
    } else {
      setOutput("暂无译文", "waiting");
      setStatus(result.message, { error: true, retry: true });
      setPhase("error");
    }
  } catch {
    if (activeRequestId !== requestId) return;
    setOutput("暂无译文", "waiting");
    setStatus("翻译失败", { error: true, retry: true });
    setPhase("error");
  } finally {
    if (activeRequestId === requestId) activeRequestId = null;
  }
}

function applyClipboardAndTranslate(text) {
  applyingClipboard = true;
  sourceText.value = typeof text === "string" ? text : "";
  applyingClipboard = false;
  translateSource({ replaceActive: true });
  if (document.activeElement === sourceText) sourceText.blur();
  document.body.focus({ preventScroll: true });
}

function updateSourceHeight(nextHeight) {
  const maxHeight = Math.max(72, workspace.clientHeight - 150);
  sourceHeight = Math.min(Math.max(nextHeight, 58), maxHeight);
  document.documentElement.style.setProperty(
    "--source-height",
    `${Math.round(sourceHeight)}px`
  );
  splitter.setAttribute("aria-valuenow", String(Math.round(sourceHeight)));
}

sourceText.addEventListener("input", () => {
  if (applyingClipboard) return;
  if (activeRequestId) window.textTranslation.cancel(activeRequestId);
  activeRequestId = null;
  setStatus("原文已修改", { retry: true });
  setPhase("editing");
});

sourceText.addEventListener("keydown", (event) => {
  if (event.ctrlKey && event.key === "Enter") {
    event.preventDefault();
    translateSource({ replaceActive: true });
  }
});

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
  renderPinnedState(await window.textTranslation.setPinned(!pinned));
});

retryButton.addEventListener("click", () => {
  translateSource({ replaceActive: true });
});

pinButton.addEventListener("click", async () => {
  pinButton.disabled = true;
  try {
    renderPinnedState(await window.textTranslation.setPinned(!pinned));
  } finally {
    pinButton.disabled = false;
  }
});

pinButton.addEventListener("pointerdown", () => {
  window.textTranslation.beginPinToggle();
});

translationMode.addEventListener("change", () => {
  const nextMode = translationMode.value;
  selectedMode = nextMode;
  translationMode.title = translationMode.selectedOptions[0]?.textContent || "翻译方式";
  translateSource({ replaceActive: true });
});

document.getElementById("close").addEventListener("click", () => {
  window.textTranslation.close();
});

splitter.addEventListener("pointerdown", (event) => {
  dragStartY = event.clientY;
  dragStartHeight = sourcePane.getBoundingClientRect().height;
  splitter.classList.add("dragging");
  splitter.setPointerCapture(event.pointerId);
});

splitter.addEventListener("pointermove", (event) => {
  if (!splitter.hasPointerCapture(event.pointerId)) return;
  updateSourceHeight(dragStartHeight + event.clientY - dragStartY);
});

function finishSplitterDrag(event) {
  if (!splitter.hasPointerCapture(event.pointerId)) return;
  splitter.releasePointerCapture(event.pointerId);
  splitter.classList.remove("dragging");
}

splitter.addEventListener("pointerup", finishSplitterDrag);
splitter.addEventListener("pointercancel", finishSplitterDrag);
splitter.addEventListener("keydown", (event) => {
  if (!["ArrowUp", "ArrowDown"].includes(event.key)) return;
  event.preventDefault();
  updateSourceHeight(sourceHeight + (event.key === "ArrowDown" ? 12 : -12));
});

window.addEventListener("resize", () => updateSourceHeight(sourceHeight));
window.textTranslation.onChunk(({ requestId, delta }) => {
  if (requestId !== activeRequestId || typeof delta !== "string") return;
  const nearBottom =
    translatedText.scrollHeight - translatedText.scrollTop - translatedText.clientHeight < 48;
  streamedText += delta;
  setOutput(streamedText, "result");
  if (nearBottom) translatedText.scrollTop = translatedText.scrollHeight;
});
window.textTranslation.onStreamReset(({ requestId }) => {
  if (requestId !== activeRequestId) return;
  streamedText = "";
  setOutput("正在重新连接…", "loading");
});
window.textTranslation.onStatus(({ requestId, status }) => {
  if (requestId !== activeRequestId) return;
  if (status?.stage === "starting") {
    setOutput("正在启动本地翻译模型…", "loading");
    setStatus("正在启动本地翻译模型…");
  } else if (status?.stage === "translating") {
    if (!streamedText) setOutput("正在翻译…", "loading");
    setStatus(`正在翻译 · ${providerLabels[selectedMode]}`);
  }
});
window.textTranslation.onClipboardRefresh(applyClipboardAndTranslate);
window.textTranslation.getBootstrap().then((bootstrap) => {
  renderPinnedState(bootstrap?.windowState?.pinned);
  selectedMode = bootstrap?.translation?.preferredMode || "free";
  providerLabels = {
    auto: "自动选择",
    free: "免费在线",
    "ai-precise": bootstrap?.translation?.model || "AI 精译",
    local: "Qwen3-4B 本地模型"
  };
  translationMode.value = selectedMode;
  const languageLabels = { "zh-CN": "中文", en: "英文" };
  directionText.textContent = `${languageLabels[bootstrap?.translation?.sourceLanguage] || "原文"} → ${languageLabels[bootstrap?.translation?.targetLanguage] || "译文"}`;
  translationMode.title = translationMode.selectedOptions[0]?.textContent || "翻译方式";
  applyClipboardAndTranslate(bootstrap?.clipboardText || "");
});
