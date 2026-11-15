const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

function helperPath() {
  if (process.resourcesPath) {
    const packaged = path.join(process.resourcesPath, "native", "windows-screen-capture.exe");
    if (fs.existsSync(packaged)) return packaged;
  }
  return path.resolve(__dirname, "../../../build/native/windows-screen-capture.exe");
}

function physicalDisplayRect(display, displays = [display]) {
  const scaleFactor = Number(display?.scaleFactor || 1);
  const width = Math.round(display.bounds.width * scaleFactor);
  const height = Math.round(display.bounds.height * scaleFactor);
  if (display.bounds.x === 0 && display.bounds.y === 0) return { x: 0, y: 0, width, height };
  const uniformScale = displays.every((item) => Number(item.scaleFactor || 1) === scaleFactor);
  if (!uniformScale) return null;
  return {
    x: Math.round(display.bounds.x * scaleFactor),
    y: Math.round(display.bounds.y * scaleFactor),
    width,
    height
  };
}

function captureWindowsDisplay(display, { displays, timeoutMs = 500 } = {}) {
  return new Promise((resolve, reject) => {
    if (process.platform !== "win32") return reject(Object.assign(new Error("unsupported platform"), { code: "unsupported" }));
    const rect = physicalDisplayRect(display, displays);
    if (!rect) return reject(Object.assign(new Error("mixed-DPI display mapping requires fallback"), { code: "display-mapping-ambiguous" }));
    const executable = helperPath();
    if (!fs.existsSync(executable)) return reject(Object.assign(new Error("native capture helper missing"), { code: "helper-missing" }));
    const expectedBytes = rect.width * rect.height * 4;
    execFile(executable, [rect.x, rect.y, rect.width, rect.height].map(String), {
      encoding: "buffer",
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: expectedBytes + 1024 * 1024
    }, (error, stdout) => {
      if (error) return reject(Object.assign(new Error("native capture failed"), { code: error.killed ? "native-timeout" : "native-failed" }));
      if (stdout.length !== expectedBytes) return reject(Object.assign(new Error("native capture returned an invalid frame"), { code: "native-invalid-frame" }));
      resolve({ buffer: stdout, rect });
    });
  });
}

module.exports = { captureWindowsDisplay, helperPath, physicalDisplayRect };
