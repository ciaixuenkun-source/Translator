const HOTKEY_GROUPS = Object.freeze({ NORMAL: "normal", GAME: "game", COMMON: "common" });

function actionIsActive(definition, context = {}) {
  if (!definition) return false;
  if (definition.group === HOTKEY_GROUPS.COMMON) return true;
  if (definition.group === HOTKEY_GROUPS.NORMAL) return context.mode !== "game";
  if (definition.group !== HOTKEY_GROUPS.GAME || context.mode !== "game") return false;
  return !definition.dynamic || Boolean(context[definition.dynamic]);
}

function actionsCanConflict(left, right) {
  if (!left || !right) return true;
  if (left.group === HOTKEY_GROUPS.COMMON || right.group === HOTKEY_GROUPS.COMMON) return true;
  return left.group === right.group;
}

module.exports = { HOTKEY_GROUPS, actionIsActive, actionsCanConflict };
