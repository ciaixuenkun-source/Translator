const fs = require("fs");
const path = require("path");
const { resolveTestBuildsDirectory } = require("./test-build-paths");

const OUTPUT_DIRECTORY = resolveTestBuildsDirectory();
const TEST_EXE_PATTERN = /^Trans-2\.0-[A-Za-z0-9-]+-(\d{8})-(\d{4}(?:\d{2})?)\.exe$/;

function listTestExecutables(directory = OUTPUT_DIRECTORY) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && TEST_EXE_PATTERN.test(entry.name))
    .map((entry) => {
      const filePath = path.join(directory, entry.name);
      const stat = fs.statSync(filePath);
      const match = entry.name.match(TEST_EXE_PATTERN);
      return {
        name: entry.name,
        path: filePath,
        size: stat.size,
        timestamp: `${match[1]}${match[2].padEnd(6, "0")}`,
        modifiedMs: stat.mtimeMs
      };
    })
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp) || right.modifiedMs - left.modifiedMs);
}

function retentionPlan(files, keepCount = 3) {
  return {
    keep: files.slice(0, keepCount),
    remove: files.slice(keepCount)
  };
}

function removeOldTestExecutables(directory = OUTPUT_DIRECTORY, keepCount = 3) {
  const resolvedDirectory = path.resolve(directory);
  const plan = retentionPlan(listTestExecutables(resolvedDirectory), keepCount);
  const removed = [];
  const skipped = [];
  for (const file of plan.remove) {
    const resolvedPath = path.resolve(file.path);
    if (
      path.dirname(resolvedPath) !== resolvedDirectory ||
      !TEST_EXE_PATTERN.test(path.basename(resolvedPath))
    ) {
      skipped.push({ ...file, reason: "outside-safe-scope" });
      continue;
    }
    try {
      if (isFileInUse(resolvedPath)) {
        skipped.push({ ...file, reason: "in-use" });
        continue;
      }
      fs.unlinkSync(resolvedPath);
      removed.push(file);
    } catch (error) {
      skipped.push({ ...file, reason: error.code || error.message });
    }
  }
  return { plan, removed, skipped };
}

function isFileInUse(filePath) {
  try {
    const handle = fs.openSync(filePath, "r+");
    fs.closeSync(handle);
    return false;
  } catch (error) {
    if (["EBUSY", "EPERM", "EACCES"].includes(error.code)) return true;
    throw error;
  }
}

function printPlan(plan) {
  console.log("Keep:");
  for (const file of plan.keep) console.log(`  ${file.path}`);
  console.log("Eligible after acceptance:");
  for (const file of plan.remove) {
    console.log(`  ${file.path} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);
  }
}

function main(argv = process.argv.slice(2)) {
  const plan = retentionPlan(listTestExecutables(), 3);
  printPlan(plan);
  const confirmed = argv.includes("--confirm") && argv.includes("--accepted");
  if (!confirmed) {
    console.log("Preview only. Cleanup requires both --accepted and --confirm after user acceptance.");
    return;
  }

  const result = removeOldTestExecutables(OUTPUT_DIRECTORY, 3);
  for (const file of result.removed) console.log(`Removed: ${file.path}`);
  for (const file of result.skipped) console.warn(`Skipped (${file.reason}): ${file.path}`);
}

if (require.main === module) main();

module.exports = {
  TEST_EXE_PATTERN,
  isFileInUse,
  listTestExecutables,
  printPlan,
  removeOldTestExecutables,
  retentionPlan
};
