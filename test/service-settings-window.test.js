const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { isSafeOfficialUrl } = require("../src/windows/service-settings/service-settings-window-controller");
const { SiliconFlowAccountInfoStore, normalizeAccountInfo } = require("../src/windows/service-settings/siliconflow-account-info-store");
const os = require("node:os");

const renderer = fs.readFileSync(path.join(__dirname, "../src/windows/service-settings/renderer.js"), "utf8");

test("all four service tutorials cover setup, credentials, tests, and common failures", () => {
  assert.match(renderer, /硅基流动 SiliconFlow[\s\S]*tencent\/Hunyuan-MT-7B[\s\S]*创建 API 密钥[\s\S]*再测试英文到中文/);
  assert.match(renderer, /魔搭社区 ModelScope[\s\S]*inclusionAI\/Ling-3\.0-flash[\s\S]*创建访问令牌[\s\S]*魔粒不足/);
  assert.match(renderer, /百度翻译[\s\S]*普通通用文本翻译 API[\s\S]*APP ID 和密钥[\s\S]*语言方向/);
  assert.match(renderer, /阿里云机器翻译[\s\S]*TranslateGeneral[\s\S]*AccessKey ID[\s\S]*alimt:TranslateGeneral[\s\S]*AdministratorAccess/);
  assert.match(renderer, /资料核对日期：\$\{VERIFIED_AT\}/);
});

test("all four provider quota tabs use service-specific official-policy content", () => {
  for (const functionName of ["siliconFlowQuotaMarkup", "modelScopeQuotaMarkup", "baiduQuotaMarkup", "aliyunQuotaMarkup"]) {
    assert.match(renderer, new RegExp(`function ${functionName}\\(`));
  }
  assert.doesNotMatch(renderer, /本页暂保留简要说明/);
});

test("configuration UI preserves credential types and supports safe error sharing", () => {
  assert.match(renderer, /\[\["appId", "APP ID"\], \["secretKey", "密钥"\]\]/);
  assert.match(renderer, /\[\["accessKeyId", "AccessKey ID"\], \["accessKeySecret", "AccessKey Secret"\]\]/);
  assert.match(renderer, /input\.type = "password"/);
  assert.match(renderer, /copyErrorDetails/);
  const html = fs.readFileSync(path.join(__dirname, "../src/windows/service-settings/index.html"), "utf8");
  assert.match(html, /id="configuredState"/);
  assert.match(html, /分享前请检查并遮挡 API Key、Token、APP ID 密钥、AccessKey/);
});

test("external tutorial links allow only approved HTTPS hosts without credential parameters", () => {
  assert.equal(isSafeOfficialUrl("https://docs.siliconflow.cn/docs/userguide/quickstart"), true);
  assert.equal(isSafeOfficialUrl("https://docs.siliconflow.cn/docs/userguide/faqs/rate-limit-and-upgradation"), true);
  assert.equal(isSafeOfficialUrl("https://www.siliconflow.cn/developer-talk/od7wj9rr23p95uhihmhrombp"), true);
  assert.equal(isSafeOfficialUrl("https://www.modelscope.cn/my/myaccesstoken"), true);
  assert.equal(isSafeOfficialUrl("http://www.modelscope.cn/"), false);
  assert.equal(isSafeOfficialUrl("https://example.com/modelscope"), false);
  assert.equal(isSafeOfficialUrl("https://www.modelscope.cn/?token=secret"), false);
  assert.equal(isSafeOfficialUrl("https://user:pass@www.modelscope.cn/"), false);
});

test("SiliconFlow tutorial alone exposes a local optional account information form", () => {
  assert.match(renderer, /service === "siliconflow" \? siliconFlowAccountInfoMarkup\(\) : ""/);
  assert.match(renderer, /账号信息保存/);
  assert.match(renderer, /硅基流动 SiliconFlow/);
  for (const label of ["登录方式", "注册邮箱", "注册手机号", "账号备注", "API 密钥名称", "注册日期"]) {
    assert.match(renderer, new RegExp(label));
  }
  assert.match(renderer, /不会在此记录登录密码/);
  assert.match(renderer, /window\.confirm\("确定清除/);
  assert.match(renderer, /saveAccountInfo/);
  assert.match(renderer, /clearAccountInfo/);
});

test("SiliconFlow tutorial follows the verified compact account and API-key flow", () => {
  for (const text of [
    "手机号短信验证码登录",
    "邮箱和微信登录入口可见，但本教程未逐一验证",
    "按需完成实名认证",
    "账户管理",
    "新建 API 密钥",
    "tencent/Hunyuan-MT-7B",
    "连接成功 · 硅基流动 · Hunyuan-MT-7B",
    "先创建新密钥",
    "请求超时",
    "不一定代表 API 密钥错误",
    "网页体验成功不代表 API 接口一定正常"
  ]) assert.match(renderer, new RegExp(text));
  assert.match(renderer, /renderSiliconFlowSteps/);
  assert.match(renderer, /compact-guide-step/);
  assert.match(renderer, /const guideSteps = renderSiliconFlowSteps\(copy\.steps\)/);
});

test("SiliconFlow tutorial leaves model and policy decisions to Translator and the quota page", () => {
  const siliconFlowBlock = renderer.match(/siliconflow:\s*\{[\s\S]*?\n  \},\n  modelscope:/)?.[0] || "";
  assert.doesNotMatch(siliconFlowBlock, /\["核对指定模型"/);
  assert.doesNotMatch(siliconFlowBlock, /\["查看当前政策"/);
  assert.match(siliconFlowBlock, /在 Translator 中配置 API 密钥/);
  assert.match(siliconFlowBlock, /设置 → 翻译服务 → 免费在线翻译 → 硅基流动 → 配置与测试/);
});

test("SiliconFlow quota page distinguishes free pricing, rate limits, risks, and optional rewards", () => {
  for (const text of [
    "0 元 / 1000 Tokens",
    "不代表永久免费",
    "尚未查到该模型公布的固定每日调用次数",
    "L0：最高 RPM 1000，最高 TPM 80000",
    "频率限制，不是每日或每月免费总额度",
    "API Key 只是调用接口的凭据",
    "不绑定支付宝就绝对不会扣费",
    "不要一遇到失败就重新创建 API Key",
    "邀请好友不是必需操作",
    "没有确认存在持续有效的每日签到奖励"
  ]) assert.match(renderer, new RegExp(text));
  assert.match(renderer, /rate-limit-and-upgradation/);
  assert.match(renderer, /service === "siliconflow"[\s\S]*siliconFlowQuotaMarkup/);
});

test("ModelScope guide uses the compact ordinary-user token flow without developer setup", () => {
  const modelScopeBlock = renderer.match(/modelscope:\s*\{[\s\S]*?\n  \},\n  baidu:/)?.[0] || "";
  for (const text of [
    "个人设置 → 访问令牌 → 新建访问令牌",
    "权限选择“仅读”",
    "适合长期使用",
    "在 Translator 中配置 Token",
    "普通用户不需要填写模型 ID 或运行开发者代码",
    "硅基流动、百度翻译或阿里云机器翻译",
    "不要把 429 限流直接判断为魔粒耗尽"
  ]) assert.match(modelScopeBlock, new RegExp(text));
  assert.doesNotMatch(modelScopeBlock, /安装 SDK|pip install|运行代码/);
  assert.match(renderer, /const guideSteps = renderSiliconFlowSteps\(copy\.steps\)/);
});

test("ModelScope quota page records the fixed verification date and separates grants, expiry, and use", () => {
  for (const text of [
    "2026年11月7日",
    "每日约获得 <strong>200 魔粒",
    "每日可额外获得 <strong>50 魔粒",
    "6000 魔粒",
    "7500 魔粒",
    "1 魔粒/次",
    "发放记录",
    "消耗统计",
    "有效期最长可达 90 天",
    "不能仅凭 429 判断魔粒已经耗尽"
  ]) assert.match(renderer, new RegExp(text));
  assert.match(renderer, /modelScopeQuotaMarkup/);
  assert.match(renderer, /资料核对截止日期：\$\{MODELSCOPE_VERIFIED_AT\}/);
});

test("Baidu guide is compact and distinguishes ordinary general text credentials", () => {
  const block = renderer.match(/baidu:\s*\{[\s\S]*?\n  \},\n  aliyun:/)?.[0] || "";
  for (const text of [
    "标准版不要求个人实名认证",
    "高级版需要个人认证",
    "尊享版需要企业认证",
    "我的服务 → 通用文本翻译",
    "APP ID 和密钥，两项必须配套使用",
    "不能当作这里的密钥",
    "测试连接和翻译"
  ]) assert.match(block, new RegExp(text));
  assert.doesNotMatch(block, /SDK|示例代码|签名算法/);
});

test("Baidu quota page records current tiers, character rules, and charging risk", () => {
  for (const text of [
    "2026年11月9日",
    "5万字符/月",
    "1 QPS",
    "1000 字符",
    "100万字符/月",
    "10 QPS",
    "200万字符/月",
    "100 QPS",
    "6000 字符",
    "49元/100万字符",
    "Translator 不会在免费额度用完时自动禁止调用",
    "一个空格",
    "不是按照译文长度计算"
  ]) assert.match(renderer, new RegExp(text));
  assert.match(renderer, /https:\/\/api\.fanyi\.baidu\.com\/product\/112/);
});

test("Aliyun guide uses TranslateGeneral with a least-privilege RAM user flow", () => {
  const block = renderer.match(/aliyun:\s*\{[\s\S]*?\n  \}\n\};/)?.[0] || "";
  for (const text of [
    "机器翻译通用版",
    "通用版 TranslateGeneral",
    "消费由所属主账号承担",
    "alimt:TranslateGeneral",
    "不要为了省事授予 AdministratorAccess",
    "同一个 RAM 用户",
    "先创建新 AccessKey"
  ]) assert.match(block, new RegExp(text));
  assert.doesNotMatch(block, /安装 SDK|运行代码|OpenAPI Explorer/);
});

test("Aliyun quota page separates shared free quota, reset, deduction, and bills", () => {
  for (const text of [
    "100万字符/月",
    "不是每个 RAM 用户各有100万字符",
    "每月1日",
    "不会累计到下个月",
    "50元/100万字符",
    "每月免费额度 → 对应资源包 → 后付费",
    "可能直接生成后付费账单",
    "监控统计",
    "费用与成本 → 账单 → 账单详情",
    "翻译成功、账户有余额或使用 RAM 用户，都不代表不会收费"
  ]) assert.match(renderer, new RegExp(text));
  assert.match(renderer, /query-resource-usage/);
  assert.match(renderer, /query-bills/);
});

test("SiliconFlow account information persists separately and drops credential-like fields", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "translator-siliconflow-account-"));
  try {
    const store = new SiliconFlowAccountInfoStore(directory);
    const saved = store.write({
      loginMethod: "email",
      email: " user@example.com ",
      phone: "13800000000",
      note: "翻译项目账号",
      apiKeyName: "Translator 主密钥",
      registrationDate: "2026-10-23",
      password: "must-not-persist",
      apiKey: "sk-must-not-persist"
    });
    assert.equal(saved.email, "user@example.com");
    assert.deepEqual(store.read(), saved);
    const raw = fs.readFileSync(path.join(directory, "siliconflow-account-info.json"), "utf8");
    assert.doesNotMatch(raw, /must-not-persist|password|apiKey"/);
    assert.deepEqual(store.clear(), normalizeAccountInfo());
    assert.equal(fs.existsSync(path.join(directory, "siliconflow-account-info.json")), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("SiliconFlow account information validates login method, date, and field lengths", () => {
  const normalized = normalizeAccountInfo({
    loginMethod: "password",
    email: "x".repeat(300),
    registrationDate: "23/10/2026"
  });
  assert.equal(normalized.loginMethod, "");
  assert.equal(normalized.email.length, 254);
  assert.equal(normalized.registrationDate, "");
});
