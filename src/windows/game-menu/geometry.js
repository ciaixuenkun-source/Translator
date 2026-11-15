function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function gameMenuBounds(ball, display, edge, size = { width: 224, height: 238 }, gap = 10) {
  let x = ball.x + Math.round((ball.width - size.width) / 2);
  let y = ball.y + Math.round((ball.height - size.height) / 2);
  if (edge === "left") x = ball.x + ball.width + gap;
  if (edge === "right") x = ball.x - size.width - gap;
  if (edge === "top") y = ball.y + ball.height + gap;
  if (edge === "bottom") y = ball.y - size.height - gap;
  return {
    x: clamp(x, display.bounds.x, display.bounds.x + display.bounds.width - size.width),
    y: clamp(y, display.bounds.y, display.bounds.y + display.bounds.height - size.height),
    ...size
  };
}

module.exports = { gameMenuBounds };
