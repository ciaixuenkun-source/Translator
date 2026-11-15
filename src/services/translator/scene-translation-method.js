const {
  AI_PRECISE_MODE,
  AUTO_MODE,
  FREE_MODE,
  LOCAL_MODE
} = require("./translation-modes");

function modeForSceneMethod(method) {
  if (method === "free-online") return FREE_MODE;
  if (method === "ai-api") return AI_PRECISE_MODE;
  if (method === "local") return LOCAL_MODE;
  return AUTO_MODE;
}

module.exports = { modeForSceneMethod };
