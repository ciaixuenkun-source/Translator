const params = new URLSearchParams(location.search);
const service = ["siliconflow", "modelscope", "baidu", "aliyun"].includes(params.get("service")) ? params.get("service") : "siliconflow";
const initialTab = ["config", "guide", "quota"].includes(params.get("tab")) ? params.get("tab") : "config";
const $ = (id) => document.getElementById(id);
const VERIFIED_AT = "2026年10月23日";
const MODELSCOPE_VERIFIED_AT = "2026年11月7日";
const BAIDU_ALIYUN_VERIFIED_AT = "2026年11月9日";

const SERVICES = {
  siliconflow: {
    title: "硅基流动 SiliconFlow", model: "tencent/Hunyuan-MT-7B", credential: "API Key",
    help: "填写 SiliconFlow 控制台创建的 API Key。输入框不会回显已保存的完整密钥；留空保存不会替换现有凭据。",
    links: {
      home: ["打开硅基流动官网", "https://siliconflow.cn/"], console: ["打开控制台", "https://cloud.siliconflow.cn/"],
      keys: ["前往 API 密钥页面", "https://cloud.siliconflow.cn/account/ak"], models: ["打开模型广场", "https://cloud.siliconflow.cn/models"],
      quickstart: ["查看官方快速上手", "https://docs.siliconflow.cn/docs/userguide/quickstart"], pricing: ["查看模型价格", "https://siliconflow.cn/pricing"],
      rateLimits: ["查看使用限制", "https://docs.siliconflow.cn/docs/userguide/faqs/rate-limit-and-upgradation"], rewards: ["查看官方活动说明", "https://www.siliconflow.cn/developer-talk/od7wj9rr23p95uhihmhrombp"]
    },
    steps: [
      ["登录硅基流动", "点击官网右上角“登录”。已实际验证手机号短信验证码登录：输入手机号、完成图片安全验证、填写短信验证码并按页面要求勾选协议。邮箱和微信登录入口可见，但本教程未逐一验证。", "home"],
      ["进入控制台", "登录后通常进入模型广场。右上角头像菜单可进入个人中心、切换账号或退出登录。", "console"],
      ["按需完成实名认证", "左侧“账户管理”中有“实名认证”入口。如需领取平台当前提供的免费体验权益，请按官网要求完成认证；已经认证的用户可跳过。认证条件和权益以官网当前规定为准。", "console"],
      ["找到 API 密钥管理", "在左侧“账户管理”中点击“API 密钥”。页面会列出密钥描述、创建时间及操作入口；已有密钥通常隐藏大部分字符，并提供复制功能。", "keys"],
      ["创建 API 密钥", "点击紫色“新建 API 密钥”，填写便于识别的密钥描述，例如“翻译”或“Translator”，然后点击“新建密钥”。创建成功后，从列表复制新密钥并妥善保管。", "keys"],
      ["在 Translator 中配置 API 密钥", "打开 Translator，进入“设置 → 翻译服务 → 免费在线翻译 → 硅基流动 → 配置与测试”。粘贴刚才复制的 API Key，然后点击“安全保存”。", null],
      ["测试连接和翻译", "先点击“测试连接”。再输入“你好”，选择“中文 → English”并点击“测试翻译”。实际验证曾返回“Hello”，并显示“连接成功 · 硅基流动 · Hunyuan-MT-7B”。也建议再测试英文到中文。", null],
      ["更换和管理密钥", "需要更换时，先创建新密钥，在 Translator 中保存并确认翻译成功，再考虑删除旧密钥。列表存在“编辑”和“删除”入口，但删除确认步骤尚未完整验证。删除旧密钥可能使仍在使用它的软件失效。", "keys"]
    ]
  },
  modelscope: {
    title: "魔搭社区 ModelScope", model: "inclusionAI/Ling-3.0-flash", credential: "Token",
    help: "填写魔搭访问令牌 Token，不是阿里云 AccessKey。输入框不会回显已保存的完整 Token。",
    links: {
      home: ["打开魔搭社区官网", "https://www.modelscope.cn/"], account: ["打开个人中心", "https://www.modelscope.cn/my/overview"],
      tokens: ["打开访问令牌页面", "https://www.modelscope.cn/my/myaccesstoken"], inference: ["查看 API-Inference 文档", "https://www.modelscope.cn/docs/model-service/API-Inference/intro"],
      model: ["打开 Ling-3.0-flash 模型页", "https://modelscope.cn/models/inclusionAI/Ling-3.0-flash"],
      magicube: ["查看我的魔粒", "https://www.modelscope.cn/magicube/usage"],
      magicubeGuide: ["查看魔粒说明", "https://modelscope.cn/docs/magicube/intro"],
      magicubeNews: ["查看官方奖励介绍", "https://www.modelscope.cn/posts/435591"]
    },
    steps: [
      ["注册或登录魔搭", "打开魔搭社区，按页面提示注册或登录。若页面要求补充邮箱、手机号、账号关联或实名认证，请按当前提示完成；没有提示时不要把可选步骤当成强制步骤。", "home"],
      ["创建访问令牌", "依次进入“个人设置 → 访问令牌 → 新建访问令牌”，权限选择“仅读”，有效期选择适合长期使用的“长期使用”，然后创建并立即复制 Token。Token 相当于账号凭据，请勿放入截图、聊天或代码仓库。", "tokens"],
      ["在 Translator 中配置 Token", "打开 Translator，进入“设置 → 翻译服务 → 免费在线翻译 → 魔搭社区 → 配置与测试”，粘贴 Token 后点击“安全保存”。", null],
      ["测试连接和翻译", "先点击“测试连接”，再分别测试“中文 → English”和“English → 中文”。Translator 已固定使用 inclusionAI/Ling-3.0-flash，普通用户不需要填写模型 ID 或运行开发者代码。", null],
      ["服务不可用时", "若魔搭暂时不可用、模型调整或魔粒不足，可在 Translator 中选择硅基流动、百度翻译或阿里云机器翻译；不要把 429 限流直接判断为魔粒耗尽。", "magicube"]
    ]
  },
  baidu: {
    title: "百度翻译", model: "普通通用文本翻译 API", fields: [["appId", "APP ID"], ["secretKey", "密钥"]],
    help: "这里需要普通“通用文本翻译 API”的 APP ID 和密钥，两项缺一不可；不要混用大模型翻译 API 的 API Key。",
    links: {
      home: ["打开百度翻译开放平台", "https://api.fanyi.baidu.com/"], console: ["打开管理控制台", "https://api.fanyi.baidu.com/api/trans/product/desktop"],
      docs: ["查看通用文本翻译官方文档", "https://api.fanyi.baidu.com/api/trans/product/apidoc/"], activate: ["开通通用文本翻译", "https://api.fanyi.baidu.com/access/0/3"],
      pricing: ["查看官方价格", "https://api.fanyi.baidu.com/product/112"], usage: ["查看用量与服务状态", "https://api.fanyi.baidu.com/api/trans/product/desktop"]
    },
    steps: [
      ["注册并登录", "打开百度翻译开放平台，用百度账号登录；首次使用时按页面提示注册开发者。", "home"],
      ["开通普通通用文本翻译", "进入“通用文本翻译 API”开通页，选择适合自己的版本。标准版不要求个人实名认证；高级版需要个人认证；尊享版需要企业认证。不要误开大模型文本翻译 API。", "activate"],
      ["确认服务与版本", "进入管理控制台，在“我的服务 → 通用文本翻译”确认服务已开通，并查看当前是标准版、高级版还是尊享版。", "console"],
      ["找到配套的 APP ID 和密钥", "在普通通用文本翻译服务的控制台中查看 APP ID 和密钥，两项必须配套使用。“API Key 管理”中的凭据可能属于大模型文本翻译 API，不能当作这里的密钥。", "console"],
      ["在 Translator 中配置", "进入“设置 → 翻译服务 → 免费在线翻译 → 百度翻译 → 配置与测试”，分别填写 APP ID 和密钥，然后点击“安全保存”。", null],
      ["测试连接和翻译", "先点击“测试连接”，再分别测试“中文 → English”和“English → 中文”。鉴权或签名错误时先核对成对凭据；IP 限制、语言方向或请求频率问题请按错误详情检查。", "docs"],
      ["安全更换凭据", "如怀疑泄露或需要更换，先在平台处理旧凭据或服务状态，再把新的一整套 APP ID 与密钥保存到 Translator 并重新测试。不要只替换其中一项。", "console"]
    ]
  },
  aliyun: {
    title: "阿里云机器翻译", model: "通用版 TranslateGeneral", fields: [["accessKeyId", "AccessKey ID"], ["accessKeySecret", "AccessKey Secret"]],
    help: "填写同一个专用 RAM 用户创建的 AccessKey ID 和 AccessKey Secret；不建议使用主账号 AccessKey。",
    links: {
      home: ["打开阿里云机器翻译", "https://www.aliyun.com/product/ai/alimt"], docs: ["查看 TranslateGeneral 官方文档", "https://help.aliyun.com/zh/machine-translation/developer-reference/api-alimt-2018-10-12-translategeneral"],
      pricing: ["查看通用版计费说明", "https://help.aliyun.com/zh/machine-translation/product-overview/billing-overview"], activate: ["查看官方开通说明", "https://help.aliyun.com/zh/machine-translation/getting-started/activate-machine-translation-for-non-developers"],
      ram: ["查看 RAM 用户授权文档", "https://help.aliyun.com/zh/machine-translation/getting-started/ram-user-authorization"], keys: ["打开 RAM 控制台", "https://ram.console.aliyun.com/"], console: ["打开机器翻译控制台", "https://mt.console.aliyun.com/"],
      usage: ["查看调用量查询方法", "https://help.aliyun.com/zh/machine-translation/product-overview/query-resource-usage"], bills: ["查看账单查询方法", "https://help.aliyun.com/zh/machine-translation/product-overview/query-bills"]
    },
    steps: [
      ["注册并完成账号要求", "注册或登录阿里云账号，并按平台当前要求完成手机号验证和实名认证。", "home"],
      ["开通机器翻译通用版", "进入机器翻译控制台，选择“机器翻译通用版”并点击“立即开通”。本教程只适用于通用版 TranslateGeneral，不是专业版、文档翻译或大模型服务。", "activate"],
      ["创建专用 RAM 用户", "在 RAM 访问控制中创建或选择专供 Translator 使用的 RAM 用户。RAM 用户归属主账号，本身不独立计费，相关消费由所属主账号承担。软件调用 API 不必开启控制台登录。", "keys"],
      ["授予最小必要权限", "优先创建仅允许 alimt:TranslateGeneral 的自定义权限策略，并授权给该 RAM 用户。不要为了省事授予 AdministratorAccess 等不必要的最高权限。", "ram"],
      ["创建并保存 AccessKey", "为同一个 RAM 用户创建 AccessKey，立即妥善保存 AccessKey ID 和 AccessKey Secret；Secret 通常只完整显示一次。", "keys"],
      ["在 Translator 中配置", "进入“设置 → 翻译服务 → 免费在线翻译 → 阿里云机器翻译 → 配置与测试”，填写同一 RAM 用户的一对 AccessKey，然后点击“安全保存”。", null],
      ["测试连接和翻译", "先点击“测试连接”，再分别测试“中文 → English”和“English → 中文”。签名错误请核对成对凭据和系统时间；权限不足请检查策略是否授予了正确用户。", "docs"],
      ["更换或排查 AccessKey", "需要更换时，先创建新 AccessKey、在 Translator 保存并测试成功，再停用旧密钥。AccessKey 失效时检查密钥状态；无权限时检查服务是否开通以及 alimt:TranslateGeneral 授权。", "ram"]
    ]
  }
};

const copy = SERVICES[service];
let lastErrorText = "";
function showTab(id) { document.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === id)); document.querySelectorAll("[data-panel]").forEach((p) => p.classList.toggle("active", p.dataset.panel === id)); }
function officialLink(key) { if (!key || !copy.links[key]) return ""; const [label, href] = copy.links[key]; return `<a class="official-link" href="${href}">${label}</a>`; }
function renderSteps(steps) { return `<div class="guide-steps">${steps.map((step, i) => `<article class="guide-step"><span class="step-number">${i + 1}</span><div><h3>${step[0]}</h3><p>${step[1]}</p>${officialLink(step[2])}${step[3] ? `<p class="expected"><strong>完成后：</strong>${step[3]}</p>` : ""}</div></article>`).join("")}</div>`; }
function renderSiliconFlowSteps(steps) { return `<div class="guide-steps compact-guide-steps">${steps.map((step, i) => `<article class="guide-step compact-guide-step"><div class="guide-step-main"><span class="step-number">${i + 1}</span><div><h3>${step[0]}</h3><p>${step[1]}</p></div></div><div class="guide-step-action">${officialLink(step[2])}</div></article>`).join("")}</div>`; }
function siliconFlowTroubleshootingMarkup() {
  return `<details class="tutorial-note-card"><summary>常见问题与密钥安全提醒</summary><div>
    <p><strong>请求超时：</strong>不一定代表 API 密钥错误，也可能与网络、平台响应或连接状态有关。先检查网络和模型可用性，再适当重试，不要立即删除密钥、重新注册或频繁创建新密钥。</p>
    <p><strong>辅助排查：</strong>官网的 Hunyuan-MT-7B 在线体验已实际验证可翻译较长中文段落，可用于检查模型页面是否工作；但网页体验成功不代表 API 接口一定正常。</p>
    <p><strong>密钥安全：</strong>不要在聊天、截图、日志或 GitHub 中公开完整 API 密钥。分享错误详情前，请先遮挡敏感信息。</p>
  </div></details>`;
}
function siliconFlowQuotaMarkup() {
  const rows = [
    ["当前免费状态", `<strong>模型：tencent/Hunyuan-MT-7B</strong><br>截至 ${VERIFIED_AT}，官网模型页标记为“限免”，输入和输出价格均为 <strong>0 元 / 1000 Tokens</strong>。这是硅基流动当前的模型定价政策，不是 Translator 提供的免费额度，也不代表永久免费。`, "pricing"],
    ["每日和每月免费额度", "目前尚未查到该模型公布的固定每日调用次数或固定每月 Token 总额。使用当前免费模型不需要每天签到，也不需要每月领取代金券；“未公布固定额度”不等于每天无限次或每月无限量。", null],
    ["调用频率限制", `<strong>L0：最高 RPM 1000，最高 TPM 80000。</strong><br>RPM 是每分钟最多请求次数，TPM 是每分钟最多处理的 Tokens。这是频率限制，不是每日或每月免费总额度；免费模型还可能有独立限流规则，具体以模型页实时显示为准。`, "rateLimits"],
    ["为什么不充值也能使用", "当前模型输入和输出价格为 0 元，因此正常调用无需先购买 Token 套餐，也无需用代金券抵扣。API Key 只是调用接口的凭据，不代表必须充值；若平台以后调整价格，应以最新价格和账户实际计费规则为准。", "pricing"]
  ];
  return `<div class="quota-rows">${rows.map(([title, body, link]) => `<section class="quota-row"><div><h3>${title}</h3><p>${body}</p></div><div class="quota-row-action">${officialLink(link)}</div></section>`).join("")}</div>
    <details class="tutorial-note-card quota-detail"><summary>免费结束、额度不足和收费风险</summary><div>
      <p>当前免费不代表未来永远免费。平台取消免费政策后，调用收费接口可能产生费用；账户已有余额、代金券等仍可能用于支付，是否欠费以平台正式计费规则为准。</p>
      <p>支付宝自动充值是需要用户主动授权开通的独立功能，但不能据此推断“不绑定支付宝就绝对不会扣费”。建议定期查看官网价格、账户余额和账单。</p>
      <p>如果模型未来收费，Translator 不会自行把已确定的 Hunyuan-MT-7B 换成其他收费模型。</p>
    </div></details>
    <details class="tutorial-note-card quota-detail"><summary>额度不足或调用失败怎么办</summary><div>
      <p>平台明确返回额度或余额不足时，请检查账户额度、余额和当前政策。请求过于频繁时可能触发频率限制，可稍后重试。</p>
      <p>请求超时、网络错误或无法连接不一定是额度不足，也可能是网络或服务器暂时异常。不要一遇到失败就重新创建 API Key。</p>
    </div></details>
    <details class="tutorial-note-card quota-detail"><summary>可选奖励</summary><div class="quota-detail-with-action">
      <div><p>平台可能提供实名认证活动奖励和邀请好友奖励。这些活动与免费模型本身的计费政策不同，不领取奖励也不代表无法使用免费模型，邀请好友不是必需操作。</p><p>奖励金额、领取资格、有效期及活动是否继续，以官网当前活动页面为准。没有确认存在持续有效的每日签到奖励。</p></div>
      <div>${officialLink("rewards")}</div>
    </div></details>`;
}
function modelScopeQuotaMarkup() {
  const rows = [
    ["每日奖励", "登录魔搭社区每日约获得 <strong>200 魔粒</strong>；绑定阿里云账号后，每日可额外获得 <strong>50 魔粒</strong>。绑定属于可选增额方式，不影响用户查看本页说明。", "magicubeNews"],
    ["连续 30 天理论发放量", "只计算每日登录奖励，30 天理论累计为 <strong>6000 魔粒</strong>；如每天同时获得绑定增额，理论累计为 <strong>7500 魔粒</strong>。这是发放量计算，不代表月底仍有同等可用余额。", "magicube"],
    ["当前模型调用消耗", "截至 2026年11月7日，Translator 使用的 <strong>inclusionAI/Ling-3.0-flash</strong> 属于标准模型，当前显示约 <strong>1 魔粒/次</strong>。实际扣减可能随平台规则、请求和模型状态变化，以消耗统计为准。", "model"],
    ["查看发放与消耗", "进入“我的魔粒”，可分别查看“发放记录”和“消耗统计”。发放记录用于确认奖励到账与有效期；消耗统计用于核对 API-Inference 的实际扣减。", "magicube"]
  ];
  return `<div class="quota-rows">${rows.map(([title, body, link]) => `<section class="quota-row"><div><h3>${title}</h3><p>${body}</p></div><div class="quota-row-action">${officialLink(link)}</div></section>`).join("")}</div>
    <details class="tutorial-note-card quota-detail"><summary>奖励有效期与实际可用余额</summary><div>
      <p>不同来源的魔粒有效期可能不同。官方资料说明，信息完善、邀请拉新、社区贡献等长期激励的有效期最长可达 90 天；每日奖励和具体活动奖励请以“发放记录”中的到期时间为准。</p>
      <p>魔粒过期是奖励余额随时间失效；API 消耗是调用模型时实际扣减，两者不是同一件事。连续领取的理论发放量也不等于当前可用余额。</p>
      <p>${officialLink("magicubeGuide")}</p>
    </div></details>
    <details class="tutorial-note-card quota-detail"><summary>其他可选奖励</summary><div>
      <p>完善资料、社区互动、内容贡献和邀请好友等活动可能获得额外魔粒。邀请好友只是可选活动，不领取这些奖励也不代表无法使用每日魔粒。</p>
      <p>奖励数量、资格、有效期和活动状态可能调整，请以官方活动页及个人“发放记录”为准。</p>
      <p>${officialLink("magicubeNews")}</p>
    </div></details>
    <details class="tutorial-note-card quota-detail"><summary>额度不足、限流或服务不可用</summary><div>
      <p>平台明确提示魔粒不足时，请查看当前余额、发放记录和消耗统计。若返回 <strong>429</strong>，表示请求触发频率限制，应稍后重试，不能仅凭 429 判断魔粒已经耗尽。</p>
      <p>网络错误、请求超时、模型不可用也不等于额度不足。魔搭暂时无法使用时，可在 Translator 中手动选择硅基流动、百度翻译或阿里云机器翻译。</p>
    </div></details>`;
}
function baiduQuotaMarkup() {
  const rows = [
    ["标准版（未认证）", "<strong>5万字符/月</strong>，<strong>1 QPS</strong>，单次请求最多 <strong>1000 字符</strong>。标准版不要求个人实名认证。", "pricing"],
    ["高级版（个人认证）", "<strong>100万字符/月</strong>，<strong>10 QPS</strong>，单次请求最多 <strong>6000 字符</strong>。需要个人认证。", "pricing"],
    ["尊享版（企业认证）", "<strong>200万字符/月</strong>，<strong>100 QPS</strong>，单次请求最多 <strong>6000 字符</strong>。需要企业认证。", "pricing"],
    ["超出免费额度", "超出对应版本每月免费字符权益的部分，当前按 <strong>49元/100万字符</strong>计费。Translator 不会在免费额度用完时自动禁止调用。", "pricing"],
    ["查看服务与用量", "进入管理控制台的“我的服务 → 通用文本翻译”，核对当前版本、服务状态和用量。平台统计与账单可能存在更新时间差异。", "usage"]
  ];
  return `<div class="quota-rows">${rows.map(([title, body, link]) => `<section class="quota-row"><div><h3>${title}</h3><p>${body}</p></div><div class="quota-row-action">${officialLink(link)}</div></section>`).join("")}</div>
    <details class="tutorial-note-card quota-detail"><summary>字符怎样计算</summary><div>
      <p>按照待翻译的<strong>原文</strong>长度计算。一个汉字、一个英文字母、一个空格、一个标点符号以及 HTML 标签等，均计入一个字符；不是按照译文长度计算。</p>
    </div></details>
    <details class="tutorial-note-card quota-detail"><summary>免费额度用完后的收费风险</summary><div>
      <p>免费字符用完后，继续调用可能产生费用，不能认为 Translator 会自动停止超额请求。建议定期在百度翻译开放平台查看用量、余额和计费规则。</p>
      <p>本页只说明普通通用文本翻译 API，不适用于大模型文本翻译 API；两者的凭据、额度与规则不能混用。</p>
    </div></details>`;
}
function aliyunQuotaMarkup() {
  const rows = [
    ["每月免费额度", "机器翻译通用版当前为 <strong>100万字符/月</strong>。主账号和其 RAM 用户共享这一额度，不是每个 RAM 用户各有100万字符。", "pricing"],
    ["重置规则", "免费额度在<strong>每月1日</strong>重置，本月未使用完的额度不会累计到下个月。", "pricing"],
    ["超额价格", "超过免费额度后，通用版当前按 <strong>50元/100万字符</strong>后付费；具体价格以账号适用的官方规则为准。", "pricing"],
    ["抵扣顺序", "依次抵扣：<strong>每月免费额度 → 对应资源包 → 后付费</strong>。没有资源包时，超额调用可能直接生成后付费账单。", "pricing"],
    ["查看调用量", "进入机器翻译控制台的“监控统计”，选择文本翻译、服务版本和时间范围，查询调用量与 QPS。", "usage"],
    ["查看账单详情", "进入阿里云“费用与成本 → 账单 → 账单详情”，核对机器翻译用量、抵扣和应付金额。", "bills"]
  ];
  return `<div class="quota-rows">${rows.map(([title, body, link]) => `<section class="quota-row"><div><h3>${title}</h3><p>${body}</p></div><div class="quota-row-action">${officialLink(link)}</div></section>`).join("")}</div>
    <details class="tutorial-note-card quota-detail"><summary>字符怎样计算</summary><div>
      <p>按待翻译原文的字符长度计费。汉字、英文字母、空格、标点符号和 HTML 标签等都会计入字符。</p>
    </div></details>
    <details class="tutorial-note-card quota-detail"><summary>用量与收费提醒</summary><div>
      <p>API 测试和成功翻译都会消耗额度。翻译成功、账户有余额或使用 RAM 用户，都不代表不会收费；RAM 用户的消费由所属主账号承担。</p>
      <p>建议定期查看调用量和账单。免费额度用完且没有可抵扣资源包时，继续调用可能直接进入后付费。</p>
    </div></details>`;
}
function siliconFlowAccountInfoMarkup() {
  return `<details class="account-info-card"><summary>账号信息保存</summary><div class="account-info-content">
    <p class="account-info-intro">仅在你主动填写并保存后，将以下辅助信息保存在 Translator 本机用户配置目录中，不会上传到服务器。</p>
    <div class="account-info-grid">
      <label><span>平台名称</span><input value="硅基流动 SiliconFlow" readonly></label>
      <label><span>登录方式</span><select id="accountLoginMethod"><option value="">请选择</option><option value="email">邮箱</option><option value="phone">手机号</option><option value="third-party">第三方账号</option></select></label>
      <label><span>注册邮箱</span><input id="accountEmail" type="email" maxlength="254" autocomplete="off" placeholder="可选填写"></label>
      <label><span>注册手机号</span><input id="accountPhone" type="tel" maxlength="40" autocomplete="off" placeholder="可选填写"></label>
      <label><span>API 密钥名称</span><input id="accountApiKeyName" maxlength="120" autocomplete="off" placeholder="只记录名称，不要填写密钥"></label>
      <label><span>注册日期</span><input id="accountRegistrationDate" type="date"></label>
      <label class="account-note"><span>账号备注</span><textarea id="accountNote" rows="3" maxlength="500" placeholder="记录账号用途或其他必要信息，请勿填写密码或 API 密钥"></textarea></label>
    </div>
    <p class="account-security-notice">建议将账号密码和 API 密钥妥善保存在手机自带的密码管理器或其他可信的密码管理工具中。本软件可以保存账号登录方式、邮箱、手机号等辅助信息，但不会在此记录登录密码。请勿将密码、API 密钥或验证码上传至 GitHub 或分享给他人。</p>
    <div class="account-info-actions"><span id="accountInfoMessage" role="status"></span><button id="clearAccountInfo" type="button">清除账号记录</button><button id="saveAccountInfo" class="primary" type="button">保存账号信息</button></div>
  </div></details>`;
}
function renderDocs() {
  const guideSteps = renderSiliconFlowSteps(copy.steps);
  const troubleshooting = service === "siliconflow" ? siliconFlowTroubleshootingMarkup() : "";
  const verifiedAt = service === "modelscope" ? MODELSCOPE_VERIFIED_AT : ["baidu", "aliyun"].includes(service) ? BAIDU_ALIYUN_VERIFIED_AT : VERIFIED_AT;
  $("guideContent").innerHTML = `<h2>${copy.title} 使用教程</h2><p class="intro">资料核对日期：${verifiedAt}。请按顺序操作；官网界面、额度、价格和模型可用性可能调整，始终以服务商当前页面为准。</p>${guideSteps}${troubleshooting}<p class="notice">Translator 只需要上面列出的对应凭据。不要公开完整密钥；分享错误详情前，请再次检查并遮挡所有敏感信息。</p>${service === "siliconflow" ? siliconFlowAccountInfoMarkup() : ""}`;
  $("quotaContent").innerHTML = service === "siliconflow"
    ? `<h2>${copy.title} 免费额度</h2><p class="intro">资料核对日期：${VERIFIED_AT}。价格、活动和使用限制可能调整，请以硅基流动官网实时显示为准。</p>${siliconFlowQuotaMarkup()}`
    : service === "modelscope"
      ? `<h2>${copy.title} 免费额度</h2><p class="intro">资料核对截止日期：${MODELSCOPE_VERIFIED_AT}。本页不会自动更新，魔粒规则、模型消耗和活动请以魔搭官网当前显示为准。</p>${modelScopeQuotaMarkup()}`
      : service === "baidu"
        ? `<h2>${copy.title} 免费额度</h2><p class="intro">资料核对日期：${BAIDU_ALIYUN_VERIFIED_AT}。本页只适用于普通通用文本翻译 API，价格和权益请以百度翻译开放平台当前显示为准。</p>${baiduQuotaMarkup()}`
        : `<h2>${copy.title} 免费额度</h2><p class="intro">资料核对日期：${BAIDU_ALIYUN_VERIFIED_AT}。本页只适用于机器翻译通用版 TranslateGeneral，价格和计费规则请以阿里云当前页面及账号账单为准。</p>${aliyunQuotaMarkup()}`;
  document.querySelectorAll(".prose a").forEach((a) => a.addEventListener("click", (event) => { event.preventDefault(); window.serviceSettings.openExternal(a.href); }));
}
function renderAccountInfo(accountInfo = {}) {
  if (service !== "siliconflow" || !$("accountLoginMethod")) return;
  $("accountLoginMethod").value = accountInfo.loginMethod || "";
  $("accountEmail").value = accountInfo.email || "";
  $("accountPhone").value = accountInfo.phone || "";
  $("accountNote").value = accountInfo.note || "";
  $("accountApiKeyName").value = accountInfo.apiKeyName || "";
  $("accountRegistrationDate").value = accountInfo.registrationDate || "";
}
function accountInfoPayload() {
  return {
    loginMethod: $("accountLoginMethod").value,
    email: $("accountEmail").value,
    phone: $("accountPhone").value,
    note: $("accountNote").value,
    apiKeyName: $("accountApiKeyName").value,
    registrationDate: $("accountRegistrationDate").value
  };
}
function bindAccountInfo(accountInfo) {
  if (service !== "siliconflow" || !$("saveAccountInfo")) return;
  renderAccountInfo(accountInfo);
  $("saveAccountInfo").addEventListener("click", async () => {
    const result = await window.serviceSettings.saveAccountInfo(accountInfoPayload());
    $("accountInfoMessage").textContent = result?.message || "账号信息保存失败";
    if (result?.ok) renderAccountInfo(result.accountInfo);
  });
  $("clearAccountInfo").addEventListener("click", async () => {
    if (!window.confirm("确定清除已保存的硅基流动账号辅助信息吗？此操作不会删除 API 密钥。")) return;
    const result = await window.serviceSettings.clearAccountInfo();
    $("accountInfoMessage").textContent = result?.message || "账号记录清除失败";
    if (result?.ok) renderAccountInfo(result.accountInfo);
  });
}
function fields() { return copy.fields || [["apiKey", copy.credential]]; }
function setConfigured(configured) { const state = $("configuredState"); state.textContent = configured ? "已安全保存" : "尚未配置"; state.classList.toggle("configured", Boolean(configured)); }
function renderCredentialFields(configured) { const root = $("credentialFields"); root.replaceChildren(); for (const [id, label] of fields()) { const wrapper = document.createElement("label"), span = document.createElement("span"), input = document.createElement("input"); span.textContent = label; input.id = `credential-${id}`; input.type = "password"; input.autocomplete = "off"; input.placeholder = configured ? "已安全保存，留空表示不修改" : "请输入"; wrapper.append(span, input); root.append(wrapper); } $("credentialHelp").textContent = copy.help; }
function payload() { const [sourceLanguage, targetLanguage] = $("direction").value.split(":"); const credentials = Object.fromEntries(fields().map(([id]) => [id, $(`credential-${id}`).value.trim()])); return { service, ...credentials, token: credentials.apiKey || "", text: $("testText").value.trim(), sourceLanguage, targetLanguage }; }
function detailsText(details) { if (!details) return ""; return [`HTTP: ${details.httpStatus || "-"}`, `Code: ${details.errorCode || "-"}`, `Message: ${details.message || "-"}`, `Request ID: ${details.requestId || "-"}`, `Model: ${details.model || copy.model}`].join("\n"); }
async function run(kind) { $("message").textContent = "正在处理..."; $("errorDetails").hidden = true; $("result").hidden = true; lastErrorText = ""; const result = await window.serviceSettings[kind](payload()); $("message").textContent = result?.message || "操作失败"; if (result?.ok && result.text) { $("result").hidden = false; $("result").textContent = `${result.text}\n\n${result.responseTimeMs || 0} ms`; } if (kind === "save" && result?.ok) setConfigured(true); if (!result?.ok && result?.details) { lastErrorText = detailsText(result.details); $("errorDetails").hidden = false; $("errorDetails").querySelector("pre").textContent = lastErrorText; } }
document.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => showTab(button.dataset.tab)));
$("closeButton").addEventListener("click", () => window.serviceSettings.close());
$("saveButton").addEventListener("click", () => run("save"));
$("testConnection").addEventListener("click", () => run("testConnection"));
$("testTranslation").addEventListener("click", () => run("testTranslation"));
$("copyErrorDetails").addEventListener("click", async () => { if (!lastErrorText) return; const copied = await window.serviceSettings.copyErrorDetails(lastErrorText); $("message").textContent = copied ? "错误详情已复制，请在分享前再次检查敏感信息" : "复制失败，请手动选择错误详情"; });
(async () => { const data = await window.serviceSettings.bootstrap(); $("serviceTitle").textContent = copy.title; $("serviceModel").textContent = copy.model; renderCredentialFields(data?.configured); setConfigured(data?.configured); renderDocs(); bindAccountInfo(data?.accountInfo); showTab(initialTab); })();
