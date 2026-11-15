function secondInstanceAction({ activelyHidden = false } = {}) {
  return activelyHidden ? "restore" : "ignore";
}

module.exports = { secondInstanceAction };
