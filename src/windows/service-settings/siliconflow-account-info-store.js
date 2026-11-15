const fs = require("fs");
const path = require("path");

const LOGIN_METHODS = new Set(["", "email", "phone", "third-party"]);
const FIELD_LIMITS = Object.freeze({
  email: 254,
  phone: 40,
  note: 500,
  apiKeyName: 120,
  registrationDate: 10
});

function limitedText(value, maximum) {
  return String(value || "").trim().slice(0, maximum);
}

function normalizeAccountInfo(value = {}) {
  const loginMethod = LOGIN_METHODS.has(value.loginMethod) ? value.loginMethod : "";
  const registrationDate = limitedText(value.registrationDate, FIELD_LIMITS.registrationDate);
  return {
    loginMethod,
    email: limitedText(value.email, FIELD_LIMITS.email),
    phone: limitedText(value.phone, FIELD_LIMITS.phone),
    note: limitedText(value.note, FIELD_LIMITS.note),
    apiKeyName: limitedText(value.apiKeyName, FIELD_LIMITS.apiKeyName),
    registrationDate: /^\d{4}-\d{2}-\d{2}$/.test(registrationDate) ? registrationDate : ""
  };
}

class SiliconFlowAccountInfoStore {
  constructor(userDataPath) {
    this.filePath = path.join(userDataPath, "siliconflow-account-info.json");
  }

  read() {
    try {
      return normalizeAccountInfo(JSON.parse(fs.readFileSync(this.filePath, "utf8")));
    } catch {
      return normalizeAccountInfo();
    }
  }

  write(value) {
    const normalized = normalizeAccountInfo(value);
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify({ version: 1, ...normalized }, null, 2)}\n`, "utf8");
    fs.renameSync(temporaryPath, this.filePath);
    return normalized;
  }

  clear() {
    try {
      fs.unlinkSync(this.filePath);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    return normalizeAccountInfo();
  }
}

module.exports = { LOGIN_METHODS, SiliconFlowAccountInfoStore, normalizeAccountInfo };
