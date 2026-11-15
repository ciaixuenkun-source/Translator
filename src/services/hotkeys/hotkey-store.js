const fs = require("fs");
const path = require("path");
const { cloneBindings, normalizeBinding } = require("./binding-utils");

class HotkeyStore {
  constructor(filePath, defaults) {
    this.filePath = filePath;
    this.defaults = defaults;
  }

  getDefaults() {
    const cloned = cloneBindings(this.defaults);
    for (const bindings of Object.values(cloned)) {
      for (const binding of bindings) {
        Object.assign(binding, normalizeBinding(binding, binding.id));
      }
    }
    return cloned;
  }

  load() {
    try {
      const payload = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      if (![1, 2, 3].includes(payload.version) || typeof payload.bindings !== "object") {
        return this.getDefaults();
      }

      const result = {};
      const migratedSources = {
        gameLocalTranslation: "localTranslation",
        gameOpenSettings: "openSettings"
      };
      for (const action of Object.keys(this.defaults)) {
        const migratedSource = migratedSources[action];
        const hasSavedAction = Object.prototype.hasOwnProperty.call(payload.bindings, action);
        const hasMigratedSource = migratedSource && Object.prototype.hasOwnProperty.call(payload.bindings, migratedSource);
        if (!hasSavedAction && !hasMigratedSource) {
          result[action] = this.getDefaults()[action];
          continue;
        }
        const savedBindings = Array.isArray(payload.bindings[hasSavedAction ? action : migratedSource])
          ? payload.bindings[hasSavedAction ? action : migratedSource]
          : [];
        const legacyDefaultIds = {
          areaTranslation: "default-area-alt-1",
          textTranslation: "default-text-alt-2"
        };
        if (
          savedBindings.length === 1 &&
          savedBindings[0]?.id === legacyDefaultIds[action]
        ) {
          result[action] = this.getDefaults()[action];
          continue;
        }
        result[action] = savedBindings
          .filter((binding) => binding.type === "keyboard")
          .filter(
            (binding) =>
              !["default-area-alt-num1", "default-text-alt-num2"].includes(
                binding.id
              )
          )
          .map((binding) => normalizeBinding(
            binding,
            hasSavedAction ? binding.id : `${binding.id}-${action}`
          ));
      }
      return result;
    } catch {
      return this.getDefaults();
    }
  }

  save(bindings) {
    const directory = path.dirname(this.filePath);
    const temporaryPath = `${this.filePath}.tmp`;
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(
      temporaryPath,
      JSON.stringify({ version: 3, bindings }, null, 2)
    );
    fs.renameSync(temporaryPath, this.filePath);
  }
}

module.exports = { HotkeyStore };
