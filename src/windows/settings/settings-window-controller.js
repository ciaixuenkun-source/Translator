const { BrowserWindow, ipcMain, net } = require("electron");
const path = require("path");
const {
  APP_ICON_PATH,
  APP_NAME,
  applyWindowAppDetails
} = require("../../app-assets");
const { BUILD_INFO } = require("../../build-info");
const { checkNetworkStatus } = require("../../services/network-status");
const { ServiceSettingsWindowController } = require("../service-settings/service-settings-window-controller");
const { OverlayPreviewWindow } = require("./overlay-preview-window");

class SettingsWindowController {
  constructor(hotkeyManager, {
    translatorSettings,
    qwenRuntime,
    languagePreferences,
    overlayStyleStore,
    getBallDisplaySettings,
    setBallDisplayMode,
    getRuntimeModeSettings,
    setRuntimeMode,
    onShowBall,
    onQuit
  }) {
    this.hotkeyManager = hotkeyManager;
    this.translatorSettings = translatorSettings;
    this.qwenRuntime = qwenRuntime;
    this.languagePreferences = languagePreferences;
    this.overlayStyleStore = overlayStyleStore;
    this.getBallDisplaySettings = getBallDisplaySettings;
    this.setBallDisplayMode = setBallDisplayMode;
    this.getRuntimeModeSettings = getRuntimeModeSettings;
    this.setRuntimeMode = setRuntimeMode;
    this.onShowBall = onShowBall;
    this.onQuit = onQuit;
    this.window = null;
    this.overlayPreview = new OverlayPreviewWindow(() => this.window);
    this.serviceWindows = new ServiceSettingsWindowController(this.translatorSettings, {
      onChanged: (snapshot) => this.notifyTranslatorSettings(snapshot)
    });
    this.connectionTestController = null;
    this.benchmarkController = null;
    this.unsubscribeLocalModelStatus = this.qwenRuntime?.subscribeStatus(
      (snapshot) => this.notifyLocalModelStatus(snapshot)
    ) || (() => {});
    this.registerIpc();
  }

  isSettingsSender(sender) {
    return Boolean(
      this.window &&
      !this.window.isDestroyed() &&
      sender.id === this.window.webContents.id
    );
  }

  registerIpc() {
    ipcMain.handle("hotkey-settings-bootstrap", (event) => {
      if (!this.isSettingsSender(event.sender)) return null;
      return this.hotkeyManager.getSnapshot();
    });

    ipcMain.handle("translator-settings-bootstrap", (event) => {
      if (!this.isSettingsSender(event.sender)) return null;
      return this.translatorSettings.getSnapshot();
    });

    ipcMain.handle("save-automatic-translation-settings", (event, payload) => {
      if (!this.isSettingsSender(event.sender)) return { ok: false, message: "Invalid settings window" };
      const result = this.translatorSettings.saveAutomaticTranslationSettings(payload);
      if (result?.ok) this.notifyTranslatorSettings(result.snapshot);
      return result;
    });

    ipcMain.handle("benchmark-free-translation-services", async (event, payload) => {
      if (!this.isSettingsSender(event.sender)) return { ok: false, message: "当前窗口无法执行测速" };
      this.benchmarkController?.abort();
      const controller = new AbortController();
      this.benchmarkController = controller;
      try {
        const result = await this.translatorSettings.benchmarkFreeProviders({
          ...payload,
          signal: controller.signal
        });
        if (result?.ok) this.notifyTranslatorSettings(this.translatorSettings.getSnapshot());
        return result;
      } finally {
        if (this.benchmarkController === controller) this.benchmarkController = null;
      }
    });

    ipcMain.on("open-service-settings", (event, payload) => {
      if (!this.isSettingsSender(event.sender)) return;
      this.serviceWindows.open(payload?.service, payload?.tab);
    });

    ipcMain.handle("language-preferences-bootstrap", (event) => {
      if (!this.isSettingsSender(event.sender)) return null;
      return this.languagePreferences.readAll();
    });

    ipcMain.handle("save-language-preference", (event, payload) => {
      if (!this.isSettingsSender(event.sender)) return { ok: false, message: "当前窗口无法保存语言方向" };
      const direction = this.languagePreferences.write(payload?.key, payload);
      const snapshot = this.languagePreferences.readAll();
      this.notifyLanguagePreferences(snapshot);
      return { ok: true, direction, snapshot };
    });

    ipcMain.handle("save-scene-translation-method", (event, payload) => {
      if (!this.isSettingsSender(event.sender)) return { ok: false, message: "当前窗口无法保存翻译方式" };
      const method = this.languagePreferences.writeMethod(payload?.key, payload?.method);
      const snapshot = this.languagePreferences.readAll();
      this.notifyLanguagePreferences(snapshot);
      return { ok: true, method, snapshot };
    });

    ipcMain.handle("save-game-fullscreen-duration", (event, value) => {
      if (!this.isSettingsSender(event.sender)) return { ok: false, message: "当前窗口无法保存停留时间" };
      const duration = this.languagePreferences.writeFullscreenDuration(value);
      const snapshot = this.languagePreferences.readAll();
      this.notifyLanguagePreferences(snapshot);
      return { ok: true, duration, snapshot };
    });

    ipcMain.handle("overlay-style-settings-bootstrap", (event) => {
      if (!this.isSettingsSender(event.sender)) return null;
      return this.overlayStyleStore.readAll();
    });

    ipcMain.handle("save-overlay-style-settings", (event, payload) => {
      if (!this.isSettingsSender(event.sender)) return { ok: false, message: "当前窗口无法保存译文外观" };
      return { ok: true, snapshot: this.overlayStyleStore.write(payload) };
    });

    ipcMain.on("update-overlay-style-preview", (event, payload) => {
      if (!this.isSettingsSender(event.sender)) return;
      this.overlayPreview.update(payload?.style || {}, { open: payload?.open !== false });
    });

    ipcMain.on("close-overlay-style-preview", (event) => {
      if (this.isSettingsSender(event.sender)) this.overlayPreview.hide();
    });

    ipcMain.handle("ball-display-settings-bootstrap", (event) => {
      if (!this.isSettingsSender(event.sender)) return null;
      return this.getBallDisplaySettings();
    });

    ipcMain.handle("runtime-mode-settings-bootstrap", (event) => {
      if (!this.isSettingsSender(event.sender)) return null;
      return this.getRuntimeModeSettings();
    });

    ipcMain.handle("local-model-status-bootstrap", (event) => {
      if (!this.isSettingsSender(event.sender)) return null;
      return this.qwenRuntime?.getStatus() || { manualHold: false, state: "stopped", message: "" };
    });

    ipcMain.handle("set-local-model-manual-hold", async (event, enabled) => {
      if (!this.isSettingsSender(event.sender)) return { ok: false, message: "当前窗口无法修改本地模型状态" };
      return this.qwenRuntime.setManualHold(Boolean(enabled));
    });

    ipcMain.handle("save-runtime-mode", (event, payload) => {
      if (!this.isSettingsSender(event.sender)) return { ok: false, message: "当前窗口无法修改运行模式" };
      return this.setRuntimeMode(payload?.mode);
    });

    ipcMain.handle("app-build-info", (event) => {
      if (!this.isSettingsSender(event.sender)) return null;
      return BUILD_INFO;
    });

    ipcMain.handle("check-network-status", async (event) => {
      if (!this.isSettingsSender(event.sender)) return { status: "unknown", label: "状态未知" };
      return checkNetworkStatus((url, options) => net.fetch(url, options));
    });

    ipcMain.handle("save-ball-display-mode", (event, payload) => {
      if (!this.isSettingsSender(event.sender)) {
        return { ok: false, message: "当前窗口无法修改悬浮球显示" };
      }
      return this.setBallDisplayMode(payload?.mode);
    });

    ipcMain.handle("test-translator-settings", async (event, payload) => {
      if (!this.isSettingsSender(event.sender)) {
        return { ok: false, message: "当前窗口无法测试翻译服务" };
      }
      this.connectionTestController?.abort();
      const controller = new AbortController();
      this.connectionTestController = controller;
      try {
        return await this.translatorSettings.testConnection(payload, {
          signal: controller.signal
        });
      } finally {
        if (this.connectionTestController === controller) {
          this.connectionTestController = null;
        }
      }
    });

    ipcMain.handle("save-translator-settings", (event, payload) => {
      if (!this.isSettingsSender(event.sender)) {
        return { ok: false, message: "当前窗口无法保存翻译服务" };
      }
      return this.translatorSettings.save(payload);
    });

    ipcMain.handle("save-free-online-settings", (event, payload) => {
      if (!this.isSettingsSender(event.sender)) {
        return { ok: false, message: "当前窗口无法保存免费在线翻译" };
      }
      return this.translatorSettings.saveFreeOnline(payload);
    });

    ipcMain.handle("test-free-online-connection", async (event, payload) => {
      if (!this.isSettingsSender(event.sender)) {
        return { ok: false, message: "当前窗口无法测试免费在线翻译" };
      }
      this.connectionTestController?.abort();
      const controller = new AbortController();
      this.connectionTestController = controller;
      try {
        return await this.translatorSettings.testFreeOnlineConnection(payload, {
          signal: controller.signal
        });
      } finally {
        if (this.connectionTestController === controller) {
          this.connectionTestController = null;
        }
      }
    });

    ipcMain.handle("test-free-online-translation", async (event, payload) => {
      if (!this.isSettingsSender(event.sender)) {
        return { ok: false, message: "当前窗口无法测试免费在线翻译" };
      }
      this.connectionTestController?.abort();
      const controller = new AbortController();
      this.connectionTestController = controller;
      try {
        return await this.translatorSettings.testFreeOnlineTranslation(payload, {
          signal: controller.signal
        });
      } finally {
        if (this.connectionTestController === controller) {
          this.connectionTestController = null;
        }
      }
    });

    ipcMain.handle("save-modelscope-settings", (event, payload) => {
      if (!this.isSettingsSender(event.sender)) return { ok: false, message: "当前窗口无法保存魔搭设置" };
      return this.translatorSettings.saveModelScope(payload);
    });

    ipcMain.handle("test-modelscope-connection", async (event, payload) => {
      if (!this.isSettingsSender(event.sender)) return { ok: false, message: "当前窗口无法测试魔搭连接" };
      this.connectionTestController?.abort();
      const controller = new AbortController();
      this.connectionTestController = controller;
      try {
        return await this.translatorSettings.testModelScopeConnection(payload, { signal: controller.signal });
      } finally {
        if (this.connectionTestController === controller) this.connectionTestController = null;
      }
    });

    ipcMain.handle("test-modelscope-translation", async (event, payload) => {
      if (!this.isSettingsSender(event.sender)) return { ok: false, message: "当前窗口无法测试魔搭翻译" };
      this.connectionTestController?.abort();
      const controller = new AbortController();
      this.connectionTestController = controller;
      try {
        return await this.translatorSettings.testModelScopeTranslation(payload, { signal: controller.signal });
      } finally {
        if (this.connectionTestController === controller) this.connectionTestController = null;
      }
    });

    ipcMain.on("begin-hotkey-capture", (event) => {
      if (!this.isSettingsSender(event.sender)) return;
      this.hotkeyManager.beginCapture();
    });

    ipcMain.on("cancel-hotkey-capture", (event) => {
      if (this.isSettingsSender(event.sender)) this.hotkeyManager.endCapture();
    });

    ipcMain.handle("save-hotkey-binding", (event, payload) => {
      if (!this.isSettingsSender(event.sender)) {
        return { ok: false, message: "当前窗口无法修改设置" };
      }
      return this.hotkeyManager.saveBinding(
        payload?.action,
        payload?.binding,
        payload?.bindingId
      );
    });

    ipcMain.handle("delete-hotkey-binding", (event, payload) => {
      if (!this.isSettingsSender(event.sender)) {
        return { ok: false, message: "当前窗口无法修改设置" };
      }
      return this.hotkeyManager.deleteBinding(
        payload?.action,
        payload?.bindingId
      );
    });

    ipcMain.handle("reset-hotkey-defaults", (event) => {
      if (!this.isSettingsSender(event.sender)) {
        return { ok: false, message: "当前窗口无法修改设置" };
      }
      return this.hotkeyManager.resetDefaults();
    });

      ipcMain.handle("reset-hotkey-action", (event, payload) => {
        if (!this.isSettingsSender(event.sender)) {
          return { ok: false, message: "当前窗口无法修改设置" };
        }
        return this.hotkeyManager.resetAction(payload?.action);
      });

    ipcMain.on("show-floating-ball", (event) => {
      if (this.isSettingsSender(event.sender)) this.onShowBall();
    });

    ipcMain.on("quit-translator", (event) => {
      if (this.isSettingsSender(event.sender)) this.onQuit();
    });

    ipcMain.on("minimize-settings-window", (event) => {
      if (this.isSettingsSender(event.sender)) this.window.minimize();
    });

    ipcMain.on("close-settings-window", (event) => {
      if (this.isSettingsSender(event.sender)) this.window.close();
    });
  }

  open() {
    if (this.window && !this.window.isDestroyed()) {
      if (this.window.isMinimized()) this.window.restore();
      this.window.show();
      this.window.focus();
      return;
    }

    this.window = new BrowserWindow({
      width: 780,
      height: 650,
      minWidth: 680,
      minHeight: 520,
      show: false,
      frame: false,
      resizable: true,
      fullscreenable: false,
      backgroundColor: "#fff8ea",
      title: APP_NAME,
      icon: APP_ICON_PATH,
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    applyWindowAppDetails(this.window);
    this.window.loadFile(path.join(__dirname, "index.html"));
    this.window.once("ready-to-show", () => {
      this.window.show();
      this.window.focus();
    });
    this.window.on("blur", () => this.overlayPreview.handleSettingsBlur());
    this.window.on("move", () => this.overlayPreview.handleSettingsMove());
    this.window.on("closed", () => {
      this.overlayPreview.dispose();
      this.connectionTestController?.abort();
      this.connectionTestController = null;
      this.hotkeyManager.endCapture();
      this.window = null;
    });
  }

  notifyRuntimeMode(snapshot) {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send("runtime-mode-changed", snapshot);
    }
  }

  notifyLanguagePreferences(snapshot) {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send("language-preferences-changed", snapshot);
    }
  }

  notifyTranslatorSettings(snapshot) {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send("translator-settings-changed", snapshot || this.translatorSettings.getSnapshot());
    }
  }

  notifyLocalModelStatus(snapshot) {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send("local-model-status-changed", snapshot);
    }
  }

  close() {
    this.overlayPreview.close();
    this.serviceWindows.closeAll();
    if (this.window && !this.window.isDestroyed()) this.window.close();
  }
}

module.exports = { SettingsWindowController };
