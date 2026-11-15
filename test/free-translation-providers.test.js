const test = require("node:test");
const assert = require("node:assert/strict");
const { BaiduTranslationProvider } = require("../src/services/translator/providers/baidu-translation-provider");
const { AliyunTranslationProvider, signedParams } = require("../src/services/translator/providers/aliyun-translation-provider");

test("Baidu signs form requests and parses translations without exposing its secret", async () => {
  let body = "";
  const provider = new BaiduTranslationProvider({ appId:"app", secretKey:"secret", fetchImpl:async (_url, options) => { body=options.body; return {ok:true,json:async()=>({trans_result:[{dst:"hello"}]})}; } });
  const result=await provider.translate({text:"你好",sourceLanguage:"zh-CN",targetLanguage:"en"});
  const params=new URLSearchParams(body); assert.equal(params.get("appid"),"app"); assert.equal(params.get("from"),"zh"); assert.match(params.get("sign"),/^[a-f0-9]{32}$/); assert.equal(body.includes("secret"),false); assert.equal(result.text,"hello");
});

test("Baidu maps rate limits to a retryable provider error", async () => {
  const provider=new BaiduTranslationProvider({appId:"app",secretKey:"secret",fetchImpl:async()=>({ok:true,json:async()=>({error_code:"54003"})})});
  await assert.rejects(provider.translate({text:"x"}),e=>e.code==="rate-limited"&&e.retryable);
});

test("Aliyun creates an RPC signature and parses TranslateGeneral", async () => {
  const sample=signedParams({AccessKeyId:"id",Action:"TranslateGeneral",SignatureNonce:"n",SignatureVersion:"1.0",SignatureMethod:"HMAC-SHA1",Timestamp:"2026-01-01T00:00:00Z",Version:"2018-08-12"},"secret"); assert.ok(sample.get("Signature")); assert.equal(sample.toString().includes("secret"),false);
  let body=""; const provider=new AliyunTranslationProvider({accessKeyId:"id",accessKeySecret:"secret",fetchImpl:async(_u,o)=>{body=o.body;return{ok:true,json:async()=>({Code:"200",Data:{Translated:"你好"}})}}}); const result=await provider.translate({text:"hello",sourceLanguage:"en",targetLanguage:"zh-CN"}); assert.match(body,/Action=TranslateGeneral/); assert.equal(body.includes("secret"),false); assert.equal(result.text,"你好");
});

test("Baidu and Aliyun keep both directions and long text intact", async () => {
  const longText = "The catalyst remained stable for 24 h while the temperature was monitored. ".repeat(20);
  for (const [name, Provider, credentials] of [
    ["baidu", BaiduTranslationProvider, { appId: "app", secretKey: "secret" }],
    ["aliyun", AliyunTranslationProvider, { accessKeyId: "id", accessKeySecret: "secret" }]
  ]) {
    for (const [text, sourceLanguage, targetLanguage] of [
      [longText, "en", "zh-CN"],
      ["催化剂在 24 小时内保持稳定。".repeat(20), "zh-CN", "en"]
    ]) {
      let body = "";
      const provider = new Provider({
        ...credentials,
        fetchImpl: async (_url, options) => {
          body = options.body;
          return {
            ok: true,
            json: async () => name === "baidu"
              ? { trans_result: [{ dst: "translated" }] }
              : { Code: "200", Data: { Translated: "translated" } }
          };
        }
      });
      const result = await provider.translate({ text, sourceLanguage, targetLanguage });
      const request = new URLSearchParams(body);
      assert.equal(result.text, "translated");
      assert.equal(name === "baidu" ? request.get("q") : request.get("SourceText"), text);
      assert.equal(name === "baidu" ? request.get("from") : request.get("SourceLanguage"), sourceLanguage === "zh-CN" ? "zh" : "en");
      assert.equal(name === "baidu" ? request.get("to") : request.get("TargetLanguage"), targetLanguage === "zh-CN" ? "zh" : "en");
      assert.equal(body.includes("secret"), false);
    }
  }
});

test("Aliyun rate limits are retryable and no credentials are echoed", async () => {
  const provider = new AliyunTranslationProvider({
    accessKeyId: "id",
    accessKeySecret: "secret-not-in-error",
    fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({ Code: "Throttling.User" }) })
  });
  await assert.rejects(provider.translate({ text: "hello" }), (error) => {
    assert.equal(error.code, "rate-limited");
    assert.equal(error.retryable, true);
    assert.doesNotMatch(JSON.stringify(error), /secret-not-in-error/);
    return true;
  });
});

test("four free providers stay serial and preferred provider comes first", () => {
  const { TranslatorSettingsService }=require("../src/services/translator/translator-settings-service"); const providers={siliconflow:{},modelscope:{},baidu:{},aliyun:{},ai:{},local:{}}; const route=TranslatorSettingsService.prototype.automaticRoute({defaultTranslationMethod:"free-online",allowPaidApi:true,preferredFreeProvider:"baidu"},providers); assert.deepEqual(route.map(x=>x.id),["baidu","siliconflow","modelscope","aliyun","ai-api","local"]);
});

test("service settings allow only official HTTPS links for all four providers", () => {
  const {isSafeOfficialUrl}=require("../src/windows/service-settings/service-settings-window-controller"); assert.equal(isSafeOfficialUrl("https://api.fanyi.baidu.com/api/trans/product/apidoc/"),true); assert.equal(isSafeOfficialUrl("https://help.aliyun.com/zh/machine-translation/product-overview/billing-overview"),true); assert.equal(isSafeOfficialUrl("https://help.aliyun.com/?token=secret"),false); assert.equal(isSafeOfficialUrl("http://api.fanyi.baidu.com/"),false);
});
