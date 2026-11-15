const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const script = fs.readFileSync(
  path.join(__dirname, "../scripts/run-test-portable.ps1"),
  "utf8"
);

test("portable test launcher uses the project TestBuilds directory and restores its process environment", () => {
  assert.match(script, /TRANSLATOR_TEST_BUILDS_DIR/);
  assert.match(script, /Join-Path \$projectRoot "TestBuilds"/);
  assert.match(script, /PortableTemp/);
  assert.match(script, /NewGuid\(\)/);
  assert.match(script, /\$env:TEMP = \$runRoot/);
  assert.match(script, /\$env:TMP = \$runRoot/);
  assert.match(script, /\$env:TEMP = \$previousTemp/);
  assert.match(script, /\$env:TMP = \$previousTmp/);
});
test("test build paths are relative to the project and support an environment override", () => {
  const { SOURCE_ROOT, resolveTestBuildsDirectory } = require("../scripts/test-build-paths");
  assert.equal(
    resolveTestBuildsDirectory({}),
    path.resolve(SOURCE_ROOT, "..", "TestBuilds")
  );
  assert.equal(
    resolveTestBuildsDirectory({ TRANSLATOR_TEST_BUILDS_DIR: "D:\\custom-translator-builds" }),
    path.resolve("D:\\custom-translator-builds")
  );
});

test("portable test launcher waits for exit and deletes only its validated run directory", () => {
  assert.match(script, /Start-Process[\s\S]*-PassThru -Wait/);
  assert.match(script, /GetCimInstance Win32_Process|Get-CimInstance Win32_Process/);
  assert.match(script, /StartsWith\([\s\S]*\$runRoot/);
  assert.match(script, /Remove-Item -LiteralPath \$runRoot -Recurse -Force/);
  assert.doesNotMatch(script, /Remove-Item[^\r\n]*\*/);
  assert.doesNotMatch(script, /SetEnvironmentVariable/);
});
