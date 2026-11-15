const { APP_NAME } = require("./app-assets");

let metadata = {};
try {
  metadata = require("./build-metadata.json");
} catch (error) {
  if (error?.code !== "MODULE_NOT_FOUND") throw error;
}

const BUILD_INFO = Object.freeze({
  appName: APP_NAME,
  appVersion: metadata.appVersion || "2.0",
  buildChannel: metadata.buildChannel || "Test",
  buildLabel: metadata.buildLabel || `${APP_NAME} 2.0 Test`,
  buildStamp: metadata.buildStamp || "dev",
  buildTime: metadata.buildTime || "Development build"
});

module.exports = { BUILD_INFO };
