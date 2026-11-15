const crypto = require("crypto");
const { TranslatorError, TranslatorConfigurationError, TranslatorCancelledError } = require("../errors");

const ALIYUN_TRANSLATE_URL = "https://mt.cn-hangzhou.aliyuncs.com/";
const ALIYUN_API_VERSION = "2018-10-12";
const percent = (value) => encodeURIComponent(value).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
function signedParams(params, secret) {
  const canonical = Object.keys(params).sort().map(k => `${percent(k)}=${percent(params[k])}`).join("&");
  const signature = crypto.createHmac("sha1", `${secret}&`).update(`POST&%2F&${percent(canonical)}`).digest("base64");
  return new URLSearchParams({ ...params, Signature: signature });
}

function xmlValue(text, name) {
  const match = String(text || "").match(new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`, "i"));
  return match?.[1]
    ?.replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&") || "";
}

async function readAliyunPayload(response) {
  if (typeof response.text === "function") {
    const text = await response.text();
    try { return JSON.parse(text); }
    catch {
      return {
        Code: xmlValue(text, "Code"),
        Message: xmlValue(text, "Message"),
        RequestId: xmlValue(text, "RequestId")
      };
    }
  }
  return response.json();
}

function safeAliyunDetails(response, payload, secrets = []) {
  const value = payload?.TranslateGeneralResponse || payload || {};
  let message = String(value.Message || value.message || "")
    .replace(/(AccessKeyId|Signature|AccessKeySecret|SourceText)\s*[=:]\s*[^&\s,;]+/gi, "$1=[removed]")
    .replace(/[\r\n\t]+/g, " ");
  for (const secret of secrets.filter(value => String(value || "").length >= 8)) {
    message = message.split(secret).join("[removed]");
  }
  return {
    httpStatus: Number(response?.status) || null,
    errorCode: String(value.Code || value.code || response?.status || "").slice(0, 120),
    message: message.slice(0, 360),
    requestId: String(value.RequestId || value.requestId || "").slice(0, 120),
    model: "通用版"
  };
}

class AliyunTranslationProvider {
  constructor({ accessKeyId, accessKeySecret, fetchImpl = fetch, timeoutMs = 15000 } = {}) { this.accessKeyId=String(accessKeyId||"").trim(); this.accessKeySecret=String(accessKeySecret||"").trim(); this.fetchImpl=fetchImpl; this.timeoutMs=timeoutMs; this.displayName="阿里云机器翻译"; }
  isConfigured() { return Boolean(this.accessKeyId && this.accessKeySecret); }
  buildRequest(text, sourceLanguage, targetLanguage) {
    const params = { AccessKeyId:this.accessKeyId, Action:"TranslateGeneral", Format:"JSON", FormatType:"text", Scene:"general", SignatureMethod:"HMAC-SHA1", SignatureNonce:crypto.randomUUID(), SignatureVersion:"1.0", SourceLanguage:sourceLanguage === "zh-CN" ? "zh" : sourceLanguage, SourceText:text, TargetLanguage:targetLanguage === "zh-CN" ? "zh" : targetLanguage, Timestamp:new Date().toISOString().replace(/\.\d{3}Z$/, "Z"), Version:ALIYUN_API_VERSION };
    return signedParams(params, this.accessKeySecret);
  }
  async translate({ text, sourceLanguage="zh-CN", targetLanguage="en", signal }={}) {
    if (!this.isConfigured()) throw new TranslatorConfigurationError("请先配置阿里云 AccessKey ID 和 Secret");
    const controller=new AbortController(); let timedOut=false; const abort=()=>controller.abort(); signal?.addEventListener("abort",abort,{once:true}); const timer=setTimeout(()=>{timedOut=true;controller.abort();},this.timeoutMs); const startedAt=Date.now();
    try {
      const response=await this.fetchImpl(ALIYUN_TRANSLATE_URL,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:this.buildRequest(text,sourceLanguage,targetLanguage).toString(),signal:controller.signal});
      const rawPayload=await readAliyunPayload(response);
      const payload=rawPayload?.TranslateGeneralResponse || rawPayload || {};
      const providerCode=String(payload.Code ?? "");
      if(!response.ok || providerCode !== "200") {
        const details=safeAliyunDetails(response,payload,[this.accessKeyId,this.accessKeySecret]);
        const rate=/Throttl|Limit/i.test(details.errorCode);
        const auth=/InvalidAccessKeyId|Signature/i.test(details.errorCode);
        const permission=/Forbidden|Unauthorized|NoPermission|AccessDenied/i.test(details.errorCode);
        throw new TranslatorError(
          rate ? "阿里云机器翻译请求过于频繁"
            : auth ? "阿里云 AccessKey 或请求签名无效"
              : permission ? "阿里云机器翻译权限不足或服务未开通"
                : "阿里云机器翻译请求失败",
          {code:rate?"rate-limited":auth?"api-key-invalid":"provider-error",retryable:rate||response.status>=500,details}
        );
      }
      const translated=String(payload.Data?.Translated||"").trim(); if(!translated) throw new TranslatorError("阿里云机器翻译没有返回有效译文",{code:"empty-response",retryable:true});
      return {text:translated,provider:"aliyun-translate",providerLabel:"阿里云机器翻译",model:"通用版",responseTimeMs:Date.now()-startedAt};
    } catch(error) { if(timedOut) throw new TranslatorError("阿里云机器翻译请求超时",{code:"request-timeout",retryable:true}); if(signal?.aborted||error?.name==="AbortError") throw new TranslatorCancelledError(); if(error instanceof TranslatorError) throw error; throw new TranslatorError("阿里云机器翻译网络连接失败",{code:"network-error",retryable:true}); }
    finally { clearTimeout(timer); signal?.removeEventListener("abort",abort); }
  }
  testConnection({signal}={}) { return this.translate({text:"你好",sourceLanguage:"zh-CN",targetLanguage:"en",signal}); }
}
module.exports={ALIYUN_TRANSLATE_URL,ALIYUN_API_VERSION,AliyunTranslationProvider,readAliyunPayload,safeAliyunDetails,signedParams};
