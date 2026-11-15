function gameRuntimeState(mode, regionSnapshot = {}) {
  return {
    mode: mode === "game" ? "game" : "normal",
    gameRegionsActive: Boolean(regionSnapshot.selectionActive || regionSnapshot.regions?.length),
    continuousPaused: Boolean(regionSnapshot.continuousPaused)
  };
}

module.exports = { gameRuntimeState };
