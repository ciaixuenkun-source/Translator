const fs = require("fs");
const path = require("path");

const RUNTIME_PACKAGES = [
  "bmp-js",
  "tesseract.js",
  "tesseract.js-core",
  "is-url",
  "regenerator-runtime",
  "wasm-feature-detect"
];

function physicalPath(resolvedPath) {
  const asarSegment = `${path.sep}app.asar${path.sep}`;
  if (!resolvedPath.includes(asarSegment)) return resolvedPath;
  const unpackedPath = resolvedPath.replace(
    asarSegment,
    `${path.sep}app.asar.unpacked${path.sep}`
  );
  return fs.existsSync(unpackedPath) ? unpackedPath : resolvedPath;
}

function packageRoot(packageName) {
  return physicalPath(path.dirname(require.resolve(`${packageName}/package.json`)));
}

function runtimeVersion() {
  const tesseractPackage = require("tesseract.js/package.json");
  const corePackage = require("tesseract.js-core/package.json");
  return `${tesseractPackage.version}-${corePackage.version}`;
}

function runtimePaths(runtimeDirectory) {
  return {
    workerPath: path.join(
      runtimeDirectory,
      "node_modules",
      "tesseract.js",
      "src",
      "worker-script",
      "node",
      "index.js"
    ),
    corePath: path.join(runtimeDirectory, "node_modules", "tesseract.js-core", "index.js")
  };
}

function runtimeIsComplete(runtimeDirectory) {
  const markerPath = path.join(runtimeDirectory, "runtime.json");
  if (!fs.existsSync(markerPath)) return false;
  try {
    const marker = JSON.parse(fs.readFileSync(markerPath, "utf8"));
    const paths = runtimePaths(runtimeDirectory);
    return marker.version === runtimeVersion()
      && JSON.stringify(marker.packages) === JSON.stringify(RUNTIME_PACKAGES)
      && RUNTIME_PACKAGES.every((packageName) => fs.existsSync(
        path.join(runtimeDirectory, "node_modules", packageName, "package.json")
      ))
      && Object.values(paths).every((filePath) => fs.existsSync(filePath));
  } catch {
    return false;
  }
}

function removeDirectory(directory) {
  fs.rmSync(directory, { recursive: true, force: true });
}

function prepareStableTesseractRuntime(userDataPath, {
  resolvePackageRoot = packageRoot,
  copyDirectory = (source, destination) => fs.cpSync(source, destination, { recursive: true })
} = {}) {
  const root = path.join(userDataPath, "ocr-runtime");
  const destination = path.join(root, runtimeVersion());
  if (runtimeIsComplete(destination)) return runtimePaths(destination);

  fs.mkdirSync(root, { recursive: true });
  const staging = path.join(root, `.staging-${process.pid}-${Date.now()}`);
  removeDirectory(staging);
  try {
    for (const packageName of RUNTIME_PACKAGES) {
      copyDirectory(
        resolvePackageRoot(packageName),
        path.join(staging, "node_modules", packageName)
      );
    }
    fs.writeFileSync(path.join(staging, "runtime.json"), JSON.stringify({
      version: runtimeVersion(),
      packages: RUNTIME_PACKAGES
    }, null, 2));

    if (!runtimeIsComplete(staging)) {
      throw new Error("Tesseract stable runtime verification failed");
    }
    removeDirectory(destination);
    fs.renameSync(staging, destination);
    return runtimePaths(destination);
  } catch (error) {
    removeDirectory(staging);
    throw error;
  }
}

module.exports = {
  RUNTIME_PACKAGES,
  physicalPath,
  prepareStableTesseractRuntime,
  runtimeIsComplete,
  runtimePaths
};
