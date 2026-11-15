const path = require("path");
const { app, BrowserWindow, clipboard, ipcMain, shell } = require("electron");
const { APP_ICON_PATH, APP_NAME, applyWindowAppDetails } = require("../../app-assets");
const { SiliconFlowAccountInfoStore } = require("./siliconflow-account-info-store");

const SERVICES = new Set(["siliconflow", "modelscope", "baidu", "aliyun"]);
const OFFICIAL_HOSTS = new Set([
  "siliconflow.cn", "www.siliconflow.cn", "cloud.siliconflow.cn", "docs.siliconflow.cn",
  "modelscope.cn", "www.modelscope.cn", "api.fanyi.baidu.com", "fanyi-api.baidu.com",
  "aliyun.com", "www.aliyun.com", "help.aliyun.com", "ram.console.aliyun.com", "mt.console.aliyun.com"
]);

function isSafeOfficialUrl(value) {
  let parsed;
  try { parsed = new URL(value); } catch { return false; }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) return false;
  if (!OFFICIAL_HOSTS.has(parsed.hostname.toLowerCase())) return false;
  for (const key of parsed.searchParams.keys()) {
    if (/token|key|secret|authorization/i.test(key)) return false;
  }
  return true;
}

class ServiceSettingsWindowController {
  constructor(translatorSettings, { onChanged = () => {} } = {}) {
    this.translatorSettings = translatorSettings;
    this.onChanged = onChanged;
    this.windows = new Map();
    this.siliconFlowAccountInfo = new SiliconFlowAccountInfoStore(app.getPath("userData"));
    this.registerIpc();
  }

  record(sender) {
    for (const [service, window] of this.windows) {
      if (!window.isDestroyed() && window.webContents.id === sender.id) return { service, window };
    }
    return null;
  }

  registerIpc() {
    ipcMain.handle("service-settings-bootstrap", (event) => {
      const record = this.record(event.sender);
      if (!record) return null;
      const free = this.translatorSettings.getFreeOnlineSnapshot();
      const state = record.service === "siliconflow" ? free : record.service === "modelscope" ? free.modelScope : free[record.service];
      return {
        service: record.service,
        configured: Boolean(state?.hasApiKey),
        accountInfo: record.service === "siliconflow" ? this.siliconFlowAccountInfo.read() : null
      };
    });
    ipcMain.handle("service-settings-save-account-info", (event, payload) => {
      const record = this.record(event.sender);
      if (!record || record.service !== "siliconflow") return { ok: false, message: "Invalid service window" };
      try {
        return { ok: true, message: "账号信息已保存在本机", accountInfo: this.siliconFlowAccountInfo.write(payload) };
      } catch {
        return { ok: false, message: "账号信息保存失败" };
      }
    });
    ipcMain.handle("service-settings-clear-account-info", (event) => {
      const record = this.record(event.sender);
      if (!record || record.service !== "siliconflow") return { ok: false, message: "Invalid service window" };
      try {
        return { ok: true, message: "账号记录已清除", accountInfo: this.siliconFlowAccountInfo.clear() };
      } catch {
        return { ok: false, message: "账号记录清除失败" };
      }
    });
    ipcMain.handle("service-settings-save", async (event, payload) => {
      const record = this.record(event.sender);
      if (!record || payload?.service !== record.service) return { ok: false, message: "Invalid service window" };
      const result = this.translatorSettings.saveFreeProvider(record.service, payload);
      if (result?.ok) this.onChanged(result.snapshot);
      return result;
    });
    ipcMain.handle("service-settings-test-connection", async (event, payload) => {
      const record = this.record(event.sender);
      if (!record || payload?.service !== record.service) return { ok: false, message: "Invalid service window" };
      const result = await this.translatorSettings.testFreeProvider(record.service, payload);
      this.onChanged(this.translatorSettings.getSnapshot());
      return result;
    });
    ipcMain.handle("service-settings-test-translation", async (event, payload) => {
      const record = this.record(event.sender);
      if (!record || payload?.service !== record.service) return { ok: false, message: "Invalid service window" };
      return this.translatorSettings.testFreeProvider(record.service, payload, { translation: true });
    });
    ipcMain.handle("service-settings-open-external", (event, url) => {
      if (!this.record(event.sender)) return false;
      if (!isSafeOfficialUrl(url)) return false;
      void shell.openExternal(url);
      return true;
    });
    ipcMain.handle("service-settings-copy-error", (event, text) => {
      if (!this.record(event.sender) || typeof text !== "string" || text.length > 8000) return false;
      clipboard.writeText(text);
      return true;
    });
    ipcMain.on("service-settings-close", (event) => this.record(event.sender)?.window.close());
  }

  open(service, tab = "config") {
    if (!SERVICES.has(service)) return null;
    const existing = this.windows.get(service);
    if (existing && !existing.isDestroyed()) {
      existing.show(); existing.focus();
      existing.webContents.executeJavaScript(`showTab(${JSON.stringify(tab)})`).catch(() => {});
      return existing;
    }
    const window = new BrowserWindow({
      width: 680, height: 600, minWidth: 580, minHeight: 500, show: false,
      frame: false, resizable: true, fullscreenable: false,
      backgroundColor: "#fff8ea", title: APP_NAME, icon: APP_ICON_PATH,
      webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false }
    });
    applyWindowAppDetails(window);
    this.windows.set(service, window);
    window.loadFile(path.join(__dirname, "index.html"), { query: { service, tab } });
    window.once("ready-to-show", () => { window.show(); window.focus(); });
    window.on("closed", () => this.windows.delete(service));
    return window;
  }

  closeAll() {
    for (const window of this.windows.values()) if (!window.isDestroyed()) window.destroy();
    this.windows.clear();
  }
}

module.exports = { ServiceSettingsWindowController, isSafeOfficialUrl };
