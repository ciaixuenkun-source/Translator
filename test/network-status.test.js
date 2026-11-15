const test = require("node:test");
const assert = require("node:assert/strict");
const { checkNetworkStatus } = require("../src/services/network-status");

test("network status accepts any healthy target and does not rely on Google", async () => {
  const result = await checkNetworkStatus(async (url) => ({ status: url.includes("baidu") ? 204 : 503 }), { timeoutMs: 20 });
  assert.equal(result.status, "online");
});
test("ambiguous failures remain unknown instead of claiming the network is offline", async () => {
  const result = await checkNetworkStatus(async () => { throw new Error("timeout"); }, { targets: ["a", "b"], timeoutMs: 20 });
  assert.equal(result.status, "unknown");
});
test("explicit failures from every target report offline", async () => {
  const result = await checkNetworkStatus(async () => {
    const error = new Error("offline");
    error.code = "INTERNET_DISCONNECTED";
    throw error;
  }, { targets: ["a", "b"], timeoutMs: 20 });
  assert.equal(result.status, "offline");
});
