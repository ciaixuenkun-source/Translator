const fs = require("fs");
const path = require("path");

class WindowPositionStore {
  constructor(filePath) { this.filePath = filePath; }
  load() {
    try {
      const value = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      return Number.isFinite(value.x) && Number.isFinite(value.y) ? { x: value.x, y: value.y } : null;
    } catch { return null; }
  }
  save(bounds) {
    if (!Number.isFinite(bounds?.x) || !Number.isFinite(bounds?.y)) return;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({ x: bounds.x, y: bounds.y }, null, 2));
    fs.renameSync(temporary, this.filePath);
  }
}

function visiblePosition(saved, displays, size, fallback) {
  if (!saved) return fallback;
  const display = displays.find(({ workArea }) => saved.x < workArea.x + workArea.width &&
    saved.x + size.width > workArea.x && saved.y < workArea.y + workArea.height && saved.y + 40 > workArea.y);
  if (!display) return fallback;
  const { workArea } = display;
  return {
    x: Math.min(Math.max(saved.x, workArea.x), workArea.x + workArea.width - Math.min(size.width, workArea.width)),
    y: Math.min(Math.max(saved.y, workArea.y), workArea.y + workArea.height - 40)
  };
}

module.exports = { WindowPositionStore, visiblePosition };
