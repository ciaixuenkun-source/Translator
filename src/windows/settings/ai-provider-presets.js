(function exposeAiProviderPresets(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.aiProviderPresets = api;
})(typeof window === "undefined" ? globalThis : window, () => {
  const CUSTOM_PROVIDER_ID = "custom";
  const CUSTOM_MODEL_ID = "custom";
  const customModel = Object.freeze({ id: CUSTOM_MODEL_ID, label: "其他模型（手动填写）" });
  const providerGroups = Object.freeze([
    { id: "domestic", label: "国内及国内常用平台" },
    { id: "international", label: "国际平台" },
    { id: "other", label: "其他" }
  ]);

  const providers = Object.freeze([
    { id: "deepseek", group: "domestic", label: "DeepSeek", baseUrl: "https://api.deepseek.com", models: [
      { id: "deepseek-chat", label: "DeepSeek Chat" },
      { id: "deepseek-reasoner", label: "DeepSeek Reasoner（推理）" },
      customModel
    ] },
    { id: "aliyun", group: "domestic", label: "阿里云百炼 / 通义千问", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", models: [
      { id: "qwen-plus", label: "Qwen Plus" },
      { id: "qwen-turbo", label: "Qwen Turbo（快速）" },
      { id: "qwen-max", label: "Qwen Max" },
      customModel
    ] },
    { id: "zhipu", group: "domestic", label: "智谱 GLM", baseUrl: "https://open.bigmodel.cn/api/paas/v4", models: [
      { id: "glm-4.5", label: "GLM-4.5" },
      { id: "glm-4.5-air", label: "GLM-4.5 Air（快速）" },
      customModel
    ] },
    { id: "moonshot", group: "domestic", label: "月之暗面 Kimi", baseUrl: "https://api.moonshot.cn/v1",
      note: "模型权限会随账号变化，请填写控制台显示的模型 ID。", models: [customModel] },
    { id: "volcengine", group: "domestic", label: "火山方舟 / 豆包", baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      note: "请填写方舟控制台中的推理接入点或模型 ID。", models: [customModel] },
    { id: "siliconflow", group: "domestic", label: "硅基流动", baseUrl: "https://api.siliconflow.cn/v1", models: [
      { id: "deepseek-ai/DeepSeek-V3.2", label: "DeepSeek V3.2" },
      { id: "Pro/moonshotai/Kimi-K2.6", label: "Kimi K2.6 Pro" },
      customModel
    ] },
    { id: "openai", group: "international", label: "OpenAI", baseUrl: "https://api.openai.com/v1",
      note: "当前 Translator 仍使用 Chat Completions 兼容调用；模型可用性取决于 OpenAI 账号权限。", models: [
      { id: "gpt-4.1", label: "GPT-4.1" },
      { id: "gpt-4.1-mini", label: "GPT-4.1 mini（快速）" },
      customModel
    ] },
    { id: "google-gemini", group: "international", label: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      note: "Gemini OpenAI 兼容接口仍可能受地区、账号和模型访问权限限制。", models: [
      { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash（快速）" },
      { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite（轻量）" },
      { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash" },
      { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro Preview（高质量）" },
      customModel
    ] },
    { id: "xai", group: "international", label: "xAI Grok", baseUrl: "https://api.x.ai/v1",
      note: "xAI 兼容接口按 /v1/chat/completions 调用；不同模型可能需要账号权限。", models: [
      { id: "grok-4.7", label: "Grok 4.7" },
      customModel
    ] },
    { id: "mistral", group: "international", label: "Mistral AI", baseUrl: "https://api.mistral.ai/v1", models: [
      { id: "mistral-medium-3.5", label: "Mistral Medium 3.5" },
      { id: "ministral-3-8b-2512", label: "Ministral 3 8B（快速）" },
      { id: "mistral-small-latest", label: "Mistral Small Latest" },
      { id: "mistral-large-latest", label: "Mistral Large Latest（高质量）" },
      customModel
    ] },
    { id: "openrouter", group: "international", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1",
      note: "聚合平台模型会随供应商和账号权限变化，请以 OpenRouter 模型页为准。", models: [
      { id: "openai/gpt-5.2", label: "OpenAI GPT-5.2（OpenRouter）" },
      customModel
    ] },
    { id: "groq", group: "international", label: "Groq", baseUrl: "https://api.groq.com/openai/v1", models: [
      { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B" },
      { id: "openai/gpt-oss-20b", label: "GPT-OSS 20B（快速）" },
      { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B Versatile" },
      { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B Instant（快速）" },
      customModel
    ] },
    { id: "together", group: "international", label: "Together AI", baseUrl: "https://api.together.xyz/v1",
      note: "Together 模型可用性会随模型库和账号权限变化。", models: [
      { id: "MiniMaxAI/MiniMax-M3", label: "MiniMax M3" },
      { id: "Qwen/Qwen3.8-Flash", label: "Qwen3.8 Flash（快速）" },
      { id: "Qwen/Qwen3.6-Plus", label: "Qwen3.6 Plus" },
      { id: "moonshotai/Kimi-K3", label: "Kimi K3" },
      { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B" },
      { id: "deepseek-ai/DeepSeek-V4.1-Flash", label: "DeepSeek V4.1 Flash" },
      customModel
    ] },
    { id: "fireworks", group: "international", label: "Fireworks AI", baseUrl: "https://api.fireworks.ai/inference/v1",
      note: "Fireworks Serverless 模型 ID 以账号可用模型为准；未列出的模型请手动填写。", models: [
      { id: "accounts/fireworks/models/deepseek-v3p1", label: "DeepSeek V3.1（Fireworks）" },
      customModel
    ] },
    { id: CUSTOM_PROVIDER_ID, group: "other", label: "其他服务商（手动配置）", baseUrl: "", models: [customModel] }
  ]);

  function normalizeBaseUrl(value) {
    return String(value || "").trim().replace(/\/+$/, "").toLowerCase();
  }
  function getProvider(id) {
    return providers.find((provider) => provider.id === id) || providers.at(-1);
  }
  function identifyProvider(baseUrl) {
    const normalized = normalizeBaseUrl(baseUrl);
    return providers.find((provider) => provider.id !== CUSTOM_PROVIDER_ID
      && normalizeBaseUrl(provider.baseUrl) === normalized) || getProvider(CUSTOM_PROVIDER_ID);
  }
  function identifyModel(provider, modelId) {
    return provider.models.find((model) => model.id !== CUSTOM_MODEL_ID && model.id === modelId) || customModel;
  }
  return {
    CUSTOM_MODEL_ID,
    CUSTOM_PROVIDER_ID,
    getProvider,
    identifyModel,
    identifyProvider,
    normalizeBaseUrl,
    providerGroups,
    providers
  };
});
