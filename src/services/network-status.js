const DEFAULT_TARGETS = [
  "https://www.baidu.com/favicon.ico",
  "https://www.msftconnecttest.com/connecttest.txt",
  "https://cp.cloudflare.com/generate_204"
];

async function checkNetworkStatus(fetchImpl, { targets = DEFAULT_TARGETS, timeoutMs = 4500 } = {}) {
  const checks = await Promise.all(targets.map(async (url) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { method: "HEAD", signal: controller.signal, cache: "no-store" });
      return response.status > 0 && response.status < 500 ? "ok" : "uncertain";
    } catch (error) {
      const code = String(error?.code || error?.cause?.code || "");
      return /INTERNET_DISCONNECTED|ENOTFOUND|NETWORK_CHANGED|NAME_NOT_RESOLVED/.test(code)
        ? "offline"
        : "uncertain";
    } finally {
      clearTimeout(timer);
    }
  }));
  if (checks.includes("ok")) return { status: "online", label: "网络正常" };
  if (checks.every((value) => value === "offline")) return { status: "offline", label: "网络不可用" };
  return { status: "unknown", label: "状态未知" };
}

module.exports = { checkNetworkStatus, DEFAULT_TARGETS };
