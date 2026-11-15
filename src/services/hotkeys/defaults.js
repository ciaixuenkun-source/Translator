const { HOTKEY_GROUPS } = require("./hotkey-policy");

const ACTION_DEFINITIONS = {
  textTranslation: { name: "剪贴板文本翻译", group: HOTKEY_GROUPS.NORMAL, recommendation: "推荐：Alt+1" },
  areaTranslation: { name: "截图识别翻译", group: HOTKEY_GROUPS.NORMAL, recommendation: "推荐：Alt+2" },
  localTranslation: { name: "手动翻译窗口", group: HOTKEY_GROUPS.NORMAL, recommendation: "推荐：Alt+3" },
  openSettings: { name: "打开设置", group: HOTKEY_GROUPS.NORMAL, recommendation: "推荐：Alt+4" },
  gameFullscreenRecognition: { name: "全屏识别翻译", group: HOTKEY_GROUPS.GAME, recommendation: "推荐：Alt+1" },
  gameRegionSelection: { name: "区域识别翻译", group: HOTKEY_GROUPS.GAME, recommendation: "推荐：Alt+2" },
  gameLocalTranslation: { name: "手动翻译窗口", group: HOTKEY_GROUPS.GAME, recommendation: "推荐：Alt+3" },
  gameOpenSettings: { name: "打开设置", group: HOTKEY_GROUPS.GAME, recommendation: "推荐：Alt+4" },
  gameMenu: { name: "呼出 / 收起菜单", group: HOTKEY_GROUPS.COMMON, recommendation: "推荐：Ctrl+Shift+G" },
  gameClearRegions: { name: "清除全部区域", group: HOTKEY_GROUPS.GAME, dynamic: "gameRegionsActive", recommendation: "推荐：Delete" },
  toggleRuntimeMode: { name: "切换日常 / 游戏模式", group: HOTKEY_GROUPS.COMMON, recommendation: "推荐：Ctrl+Shift+F" },
  toggleFloatingUi: { name: "完全隐藏 / 恢复玩偶", group: HOTKEY_GROUPS.COMMON, recommendation: "推荐：Ctrl+Shift+H" }
};
const ACTIONS = Object.fromEntries(Object.entries(ACTION_DEFINITIONS).map(([id, item]) => [id, item.name]));
const DEFAULT_BINDINGS = {
  textTranslation: [{ id: "default-text-alt-1", type: "keyboard", accelerator: "Alt+1" }],
  areaTranslation: [{ id: "default-area-alt-2", type: "keyboard", accelerator: "Alt+2" }],
  localTranslation: [{ id: "default-local-translation-alt-3", type: "keyboard", accelerator: "Alt+3" }],
  openSettings: [{ id: "default-open-settings-alt-4", type: "keyboard", accelerator: "Alt+4" }],
  gameFullscreenRecognition: [{ id: "default-game-fullscreen-alt-1", type: "keyboard", accelerator: "Alt+1" }],
  gameRegionSelection: [{ id: "default-game-region-alt-2", type: "keyboard", accelerator: "Alt+2" }],
  gameLocalTranslation: [{ id: "default-game-local-translation-alt-3", type: "keyboard", accelerator: "Alt+3" }],
  gameOpenSettings: [{ id: "default-game-open-settings-alt-4", type: "keyboard", accelerator: "Alt+4" }],
  gameMenu: [{ id: "default-game-menu-control-shift-g", type: "keyboard", accelerator: "Control+Shift+G" }],
  gameClearRegions: [{ id: "default-game-clear-delete", type: "keyboard", accelerator: "Delete" }],
  toggleRuntimeMode: [{ id: "default-toggle-runtime-control-shift-f", type: "keyboard", accelerator: "Control+Shift+F" }],
  toggleFloatingUi: [{ id: "default-toggle-floating-ui-control-shift-h", type: "keyboard", accelerator: "Control+Shift+H" }]
};
module.exports = { ACTION_DEFINITIONS, ACTIONS, DEFAULT_BINDINGS };
