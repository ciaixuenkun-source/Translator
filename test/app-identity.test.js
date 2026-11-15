const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("app identity uses the Trans display name with one stable Windows app id", () => {
  const appAssets = fs.readFileSync(path.join(root, "src/app-assets.js"), "utf8");
  const main = fs.readFileSync(path.join(root, "src/main.js"), "utf8");
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

  assert.match(appAssets, /const APP_NAME = "Trans"/);
  assert.match(appAssets, /const APP_ID = "com\.translator\.desktop"/);
  assert.match(appAssets, /setAppDetails\?\.\(\{[\s\S]*appId:\s*APP_ID/);
  assert.match(main, /app\.setName\(APP_NAME\)/);
  assert.match(main, /app\.setAppUserModelId\(APP_ID\)/);
  assert.equal(packageJson.build.productName, "Trans");
  assert.equal(packageJson.build.appId, "com.translator.desktop");
  assert.equal(packageJson.build.nsis.shortcutName, "Trans");
  assert.equal(packageJson.build.nsis.uninstallDisplayName, "Trans");
});

test("taskbar windows share the same icon, title, and Windows app details", () => {
  const files = [
    "src/windows/translation-window-controller.js",
    "src/services/region-capture/region-capture-controller.js",
    "src/windows/settings/settings-window-controller.js"
  ];

  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    assert.match(source, /APP_NAME/);
    assert.match(source, /title:\s*APP_NAME/);
    assert.match(source, /icon:\s*APP_ICON_PATH/);
    assert.match(source, /applyWindowAppDetails\(/);
  }
});

test("window document titles use Trans while internal feature labels can remain specific", () => {
  const files = [
    "src/windows/text-input/index.html",
    "src/services/region-capture/preview/index.html",
    "src/windows/settings/index.html",
    "src/windows/result/index.html",
    "src/renderer/index.html",
    "src/services/region-capture/overlay/index.html"
  ];

  for (const file of files) {
    const html = fs.readFileSync(path.join(root, file), "utf8");
    assert.match(html, /<title>Trans<\/title>/);
  }

  assert.match(
    fs.readFileSync(path.join(root, "src/windows/text-input/index.html"), "utf8"),
    /原文[\s\S]*译文[\s\S]*翻译模式/
  );
  assert.match(
    fs.readFileSync(path.join(root, "src/services/region-capture/preview/index.html"), "utf8"),
    /区域翻译|翻译/
  );
  assert.match(
    fs.readFileSync(path.join(root, "src/windows/settings/index.html"), "utf8"),
    /设置/
  );
});

test("floating and transient helper windows stay out of the taskbar but keep app details", () => {
  const main = fs.readFileSync(path.join(root, "src/main.js"), "utf8");
  const resultWindow = fs.readFileSync(
    path.join(root, "src/windows/result/result-window-manager.js"),
    "utf8"
  );
  const overlay = fs.readFileSync(
    path.join(root, "src/services/region-capture/region-capture-controller.js"),
    "utf8"
  );

  assert.match(main, /skipTaskbar:\s*true[\s\S]*title:\s*APP_NAME/);
  assert.match(main, /applyWindowAppDetails\(mainWindow\)/);
  assert.match(resultWindow, /skipTaskbar:\s*true[\s\S]*title:\s*APP_NAME/);
  assert.match(resultWindow, /applyWindowAppDetails\(window\)/);
  assert.match(overlay, /show:\s*false[\s\S]*skipTaskbar:\s*true/);
});

test("build metadata is centralized and shown in the settings window", () => {
  const buildInfo = fs.readFileSync(path.join(root, "src/build-info.js"), "utf8");
  const settingsHtml = fs.readFileSync(path.join(root, "src/windows/settings/index.html"), "utf8");
  const settingsPreload = fs.readFileSync(path.join(root, "src/windows/settings/preload.js"), "utf8");
  const settingsRenderer = fs.readFileSync(path.join(root, "src/windows/settings/renderer.js"), "utf8");
  const settingsController = fs.readFileSync(
    path.join(root, "src/windows/settings/settings-window-controller.js"),
    "utf8"
  );

  assert.match(buildInfo, /BUILD_INFO/);
  assert.match(buildInfo, /require\("\.\/build-metadata\.json"\)/);
  assert.match(buildInfo, /MODULE_NOT_FOUND/);
  assert.match(buildInfo, /appVersion:\s*metadata\.appVersion \|\| "2\.0"/);
  assert.match(settingsController, /app-build-info/);
  assert.match(settingsPreload, /getBuildInfo/);
  assert.match(settingsHtml, /id="buildInfo"/);
  assert.match(settingsRenderer, /renderBuildInfo/);
});

test("test portable build script creates timestamped Trans 2.0 test executables", () => {
  const script = fs.readFileSync(path.join(root, "scripts/build-test-portable.js"), "utf8");
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

  assert.equal(packageJson.scripts["dist:win:test"], "node scripts/build-test-portable.js");
  assert.match(script, /Trans-2\.0-Test-\$\{metadata\.buildStamp\}\.exe/);
  assert.match(script, /LocalScreenTranslator-0\.1\.0-portable\.exe/);
  assert.match(script, /writeBuildMetadata/);
  assert.match(script, /cleanOldTestExecutables/);
  assert.match(script, /buildStamp/);
  const cleanup = script.match(/function cleanOldTestExecutables\(\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.doesNotMatch(cleanup, /Trans-2\.0-Test/);
});

test("taskbar icon is generated from the bagless doll head source", () => {
  const script = fs.readFileSync(path.join(root, "scripts/generate-app-icons.js"), "utf8");
  const notices = fs.readFileSync(path.join(root, "build/legal/THIRD_PARTY_NOTICES.md"), "utf8");

  assert.match(script, /translator-jump-doll\.png/);
  assert.doesNotMatch(script, /translator-mascot\.png/);
  assert.match(script, /SOURCE_HEAD_CROP/);
  assert.match(script, /app-icon-source\.png/);
  assert.ok(fs.existsSync(path.join(root, "src/assets/icons/app-icon-source.png")));
  assert.ok(fs.existsSync(path.join(root, "src/assets/icons/app-icon-256.png")));
  assert.ok(fs.existsSync(path.join(root, "src/assets/icons/app-icon.ico")));
  assert.match(notices, /src\/assets\/icons\/app-icon-source\.png/);
});
