const path = require("node:path");

const SOURCE_ROOT = path.resolve(__dirname, "..");

function resolveTestBuildsDirectory(environment = process.env) {
  const configured = String(environment.TRANSLATOR_TEST_BUILDS_DIR || "").trim();
  return path.resolve(configured || path.join(SOURCE_ROOT, "..", "TestBuilds"));
}

module.exports = {
  SOURCE_ROOT,
  resolveTestBuildsDirectory
};
