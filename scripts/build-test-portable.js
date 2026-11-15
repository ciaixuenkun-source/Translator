const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { listPackage } = require("@electron/asar");
const {
  listTestExecutables,
  printPlan,
  retentionPlan
} = require("./manage-test-builds");
const { resolveTestBuildsDirectory } = require("./test-build-paths");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIRECTORY = resolveTestBuildsDirectory();
const SOURCE_EXE = path.join(OUTPUT_DIRECTORY, "LocalScreenTranslator-0.1.0-portable.exe");
const METADATA_PATH = path.join(ROOT, "src", "build-metadata.json");
const PACKAGED_RESOURCES_DIRECTORY = path.join(OUTPUT_DIRECTORY, "win-unpacked", "resources");

function sourceFiles(directory, relativeDirectory = "src") {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    return entry.isDirectory() ? sourceFiles(absolutePath, relativePath) : [relativePath];
  });
}

function verifyPackagedRuntime() {
  const archivePath = path.join(PACKAGED_RESOURCES_DIRECTORY, "app.asar");
  if (!fs.existsSync(archivePath)) {
    throw new Error(`Portable runtime is missing its application archive: ${archivePath}`);
  }
  const archiveEntries = new Set(listPackage(archivePath).map((entry) => entry.replace(/^[/\\]/, "").replaceAll("\\", "/")));
  const excludedSourceFiles = new Set([
    "src/renderer/assets/floating-bomb.svg",
    "src/renderer/assets/translator-edge-doll.png",
    "src/services/translator/providers/free-placeholder-provider.js"
  ]);
  const missingSourceFiles = sourceFiles(path.join(ROOT, "src"))
    .filter((entry) => !excludedSourceFiles.has(entry))
    .filter((entry) => !archiveEntries.has(entry));
  const requiredArchiveEntries = [
    "package.json",
    "src/main.js",
    "src/services/floating-ball/docked-ball-state-machine.js"
  ];
  const missingArchiveEntries = requiredArchiveEntries.filter((entry) => !archiveEntries.has(entry));
  const unpackedDirectory = path.join(PACKAGED_RESOURCES_DIRECTORY, "app.asar.unpacked");
  const requiredFiles = [
    path.join(unpackedDirectory, "node_modules", "sharp", "package.json"),
    path.join(unpackedDirectory, "node_modules", "sharp", "dist", "index.cjs"),
    path.join(unpackedDirectory, "node_modules", "@img", "sharp-win32-x64", "package.json"),
    path.join(unpackedDirectory, "node_modules", "@img", "sharp-win32-x64", "lib", "sharp-win32-x64-0.35.4.node"),
    path.join(OUTPUT_DIRECTORY, "win-unpacked", "resources", "native", "windows-screen-capture.exe")
  ];
  const missing = requiredFiles.filter((filePath) => !fs.existsSync(filePath));
  if (missing.length || missingArchiveEntries.length || missingSourceFiles.length) {
    throw new Error(`Portable runtime is incomplete:\n${[
      ...missing,
      ...missingArchiveEntries.map((entry) => `${archivePath}:${entry}`),
      ...missingSourceFiles.map((entry) => `${archivePath}:${entry}`)
    ].join("\n")}`);
  }
  console.log(`Verified app.asar (${sourceFiles(path.join(ROOT, "src")).length - excludedSourceFiles.size} source files), Sharp and native screen-capture runtime files.`);
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function buildStamp(date = new Date()) {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("") + "-" + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}

function displayTime(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function writeBuildMetadata(date) {
  const stamp = buildStamp(date);
  const metadata = {
    appVersion: "2.0",
    buildChannel: "Test",
    buildLabel: "Trans 2.0 Test",
    buildStamp: stamp,
    buildTime: displayTime(date)
  };
  fs.writeFileSync(METADATA_PATH, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  return metadata;
}

function cleanOldTestExecutables() {
  fs.mkdirSync(OUTPUT_DIRECTORY, { recursive: true });
  for (const entry of fs.readdirSync(OUTPUT_DIRECTORY, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".exe")) continue;
    if (entry.name === "LocalScreenTranslator-0.1.0-portable.exe") {
      const filePath = path.join(OUTPUT_DIRECTORY, entry.name);
      try {
        fs.unlinkSync(filePath);
      } catch (error) {
        if (!["EBUSY", "EPERM"].includes(error.code)) throw error;
        console.warn(`Skipping in-use test executable: ${filePath}`);
      }
    }
  }
}

function main() {
  const metadata = writeBuildMetadata(new Date());
  execFileSync(process.execPath, [path.join(ROOT, "scripts", "generate-game-eye-assets.js")], {
    cwd: ROOT,
    stdio: "inherit"
  });
  execFileSync("powershell", [
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    path.join(ROOT, "scripts", "build-windows-screen-capture.ps1")
  ], { cwd: ROOT, stdio: "inherit" });
  cleanOldTestExecutables();
  const electronBuilderCli = require.resolve("electron-builder/out/cli/cli.js");
  execFileSync(process.execPath, [
    electronBuilderCli,
    "--win",
    "portable",
    "--x64",
    `--config.directories.output=${OUTPUT_DIRECTORY}`
  ], {
    cwd: ROOT,
    stdio: "inherit"
  });
  verifyPackagedRuntime();

  const target = path.join(OUTPUT_DIRECTORY, `Trans-2.0-Test-${metadata.buildStamp}.exe`);
  if (!fs.existsSync(SOURCE_EXE)) {
    throw new Error(`Portable build was not created: ${SOURCE_EXE}`);
  }
  if (fs.existsSync(target)) fs.unlinkSync(target);
  fs.renameSync(SOURCE_EXE, target);
  console.log(JSON.stringify({
    build: metadata,
    output: target
  }, null, 2));
  console.log("Test build retention preview (cleanup deferred until the new EXE is actually launched and accepted):");
  printPlan(retentionPlan(listTestExecutables(OUTPUT_DIRECTORY), 3));
}

if (require.main === module) {
  main();
}

module.exports = {
  buildStamp,
  cleanOldTestExecutables,
  displayTime,
  verifyPackagedRuntime,
  writeBuildMetadata
};
