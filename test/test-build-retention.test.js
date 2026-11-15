const test = require("node:test");
const assert = require("node:assert/strict");
const {
  TEST_EXE_PATTERN,
  listTestExecutables,
  removeOldTestExecutables,
  retentionPlan
} = require("../scripts/manage-test-builds");
const fs = require("node:fs");
const path = require("node:path");

test("test build retention recognizes only the formal timestamped exe name", () => {
  assert.match("Trans-2.0-Test-20261010-2231.exe", TEST_EXE_PATTERN);
  assert.match("Trans-2.0-Settings-Restore-20261018-1935.exe", TEST_EXE_PATTERN);
  assert.match("Trans-2.0-Settings-Refresh-20261018-223155.exe", TEST_EXE_PATTERN);
  assert.doesNotMatch("LocalScreenTranslator-0.1.0-portable.exe", TEST_EXE_PATTERN);
  assert.doesNotMatch("Trans-2.0-Test-latest.exe", TEST_EXE_PATTERN);
});

test("test build retention keeps the newest three builds", () => {
  const files = ["2300", "2231", "2132", "2127"].map((time) => ({
    name: `Trans-2.0-Test-20261010-${time}.exe`,
    path: time,
    size: 1
  }));
  const plan = retentionPlan(files);
  assert.deepEqual(plan.keep.map((file) => file.path), ["2300", "2231", "2132"]);
  assert.deepEqual(plan.remove.map((file) => file.path), ["2127"]);
});

test("portable builds defer cleanup until after real EXE launch verification", () => {
  const script = fs.readFileSync(
    path.join(__dirname, "../scripts/build-test-portable.js"),
    "utf8"
  );
  const renameIndex = script.indexOf("fs.renameSync(SOURCE_EXE, target)");
  const verificationIndex = script.indexOf("verifyPackagedRuntime();");

  assert.ok(renameIndex >= 0);
  assert.ok(verificationIndex >= 0 && verificationIndex < renameIndex);
  assert.doesNotMatch(script, /removeOldTestExecutables\(OUTPUT_DIRECTORY, 3\)/);
  assert.doesNotMatch(script, /--config\.asar=false/);
  assert.match(script, /listPackage\(archivePath\)/);
  assert.match(script, /docked-ball-state-machine\.js/);
  assert.match(script, /app\.asar\.unpacked/);
  assert.match(script, /sharp-win32-x64-0\.35\.4\.node/);
  assert.match(script, /windows-screen-capture\.exe/);
  assert.match(script, /cleanup deferred until the new EXE is actually launched and accepted/);
});

test("cleanup deletes only formal test executables and preserves unrelated files", () => {
  const os = require("node:os");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "trans-build-retention-"));
  const names = [
    "Trans-2.0-Test-20261011-2302.exe",
    "Trans-2.0-Test-20261011-2233.exe",
    "Trans-2.0-Test-20261011-1902.exe",
    "Trans-2.0-Test-20261011-1700.exe",
    "Trans-2.0-Test-latest.exe",
    "OtherTool.exe",
    "builder-debug.yml",
    "build.log"
  ];
  try {
    for (const name of names) fs.writeFileSync(path.join(directory, name), name);
    const result = removeOldTestExecutables(directory, 3);
    assert.deepEqual(result.removed.map((file) => file.name), ["Trans-2.0-Test-20261011-1700.exe"]);
    assert.deepEqual(listTestExecutables(directory).map((file) => file.name), [
      "Trans-2.0-Test-20261011-2302.exe",
      "Trans-2.0-Test-20261011-2233.exe",
      "Trans-2.0-Test-20261011-1902.exe"
    ]);
    for (const name of ["Trans-2.0-Test-latest.exe", "OtherTool.exe", "builder-debug.yml", "build.log"]) {
      assert.equal(fs.existsSync(path.join(directory, name)), true);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
