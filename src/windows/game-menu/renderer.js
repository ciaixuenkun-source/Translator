const buttons = [...document.querySelectorAll("button")];
let index = 0;
function focusAt(next) {
  index = (next + buttons.length) % buttons.length;
  buttons[index].focus();
}
for (const [buttonIndex, button] of buttons.entries()) {
  button.addEventListener("focus", () => { index = buttonIndex; });
  button.addEventListener("click", () => {
    if (button.dataset.action === "closeMenu") window.gameMenu.close();
    else window.gameMenu.action(button.dataset.action);
  });
}
window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown" || event.key === "ArrowRight") { event.preventDefault(); focusAt(index + 1); }
  if (event.key === "ArrowUp" || event.key === "ArrowLeft") { event.preventDefault(); focusAt(index - 1); }
  if (event.key === "Escape") { event.preventDefault(); window.gameMenu.close(); }
  if (event.key === "Enter") { event.preventDefault(); buttons[index].click(); }
});
window.addEventListener("DOMContentLoaded", () => focusAt(0));
window.gameMenu.onFocus(() => focusAt(0));
