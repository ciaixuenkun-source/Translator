const fan = document.getElementById("fan");
const buttons = [...document.querySelectorAll(".fan-item")];
const primaryIcon = document.querySelector(".primary-icon");
const primaryLabel = document.querySelector(".primary-label");
const primaryButton = document.querySelector(".item-primary");
const regionButton = document.querySelector(".item-region");
const translateButton = document.querySelector(".item-translate");
const notice = document.getElementById("notice");
let interactive = false;
let noticeTimer = null;

function setInteractive(next) {
  if (interactive === next) return;
  interactive = next;
  window.fanMenu.setInteractive(next);
}

function hitButton(event) {
  return Boolean(event.target.closest?.(".fan-item"));
}

function setModeContent(mode) {
  if (mode === "game") {
    primaryIcon.src = "../../renderer/assets/icon-fullscreen.svg";
    primaryLabel.textContent = "全屏";
    primaryButton.dataset.action = "gameFullscreenRecognition";
    regionButton.dataset.action = "gameRegionSelection";
    translateButton.dataset.action = "localTranslation";
    return;
  }
  primaryIcon.src = "../../renderer/assets/icon-text.svg";
  primaryLabel.textContent = "文本";
  primaryButton.dataset.action = "textTranslation";
  regionButton.dataset.action = "areaTranslation";
  translateButton.dataset.action = "localTranslation";
}

function showNotice(message) {
  notice.textContent = message;
  notice.hidden = false;
  notice.classList.add("visible");
  window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => {
    notice.classList.remove("visible");
    notice.hidden = true;
  }, 1800);
}

window.addEventListener("mousemove", (event) => setInteractive(hitButton(event)));
window.addEventListener("mouseleave", () => setInteractive(false));
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") window.fanMenu.close();
});

for (const button of buttons) {
  button.addEventListener("click", () => {
    button.classList.remove("pressed");
    void button.offsetWidth;
    button.classList.add("pressed");
    if (button.dataset.action === "placeholder") {
      showNotice("功能尚未完善，此功能将在后续版本中开放。");
      return;
    }
    window.fanMenu.action(button.dataset.action);
  });
  button.addEventListener("animationend", () => button.classList.remove("pressed"));
}

window.fanMenu.onState((state) => {
  setModeContent(state.mode);
  fan.className = `fan mode-${state.mode} layout-${state.layout}`;
  fan.style.setProperty("--anchor-x", `${state.anchor.x}px`);
  fan.style.setProperty("--anchor-y", `${state.anchor.y}px`);
  fan.style.setProperty("--menu-nudge-x", `${state.nudge?.x || 0}px`);
  fan.style.setProperty("--menu-nudge-y", `${state.nudge?.y || 0}px`);
  buttons.forEach((button, index) => {
    const offset = state.offsets?.[index];
    if (!offset) return;
    button.style.setProperty("--tx", `${offset.x}px`);
    button.style.setProperty("--ty", `${offset.y}px`);
  });
  setInteractive(false);
  void fan.offsetWidth;
  fan.classList.add("open", "opening");
  window.setTimeout(() => fan.classList.remove("opening"), 1050);
});
