const test = require("node:test");
const assert = require("node:assert/strict");
const { HotkeyTriggerGuard } = require("../src/services/hotkeys/hotkey-trigger-guard");

test("hotkey guard suppresses reentrant and held-key repeats", () => {
  let now = 1000;
  let calls = 0;
  const guard = new HotkeyTriggerGuard({ cooldownMs: 350, now: () => now });
  guard.run("Alt+1", () => {
    calls += 1;
    assert.equal(guard.run("Alt+1", () => { calls += 1; }), false);
  });
  now += 40;
  assert.equal(guard.run("Alt+1", () => { calls += 1; }), false);
  assert.equal(calls, 1);
});

test("hotkey guard permits a deliberate later press", () => {
  let now = 1000;
  let calls = 0;
  const guard = new HotkeyTriggerGuard({ cooldownMs: 350, now: () => now });
  assert.equal(guard.run("Alt+2", () => { calls += 1; }), true);
  now += 351;
  assert.equal(guard.run("Alt+2", () => { calls += 1; }), true);
  assert.equal(calls, 2);
});
