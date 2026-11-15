const test = require("node:test");
const assert = require("node:assert/strict");
const {
  BALL_DISPLAY_MODES,
  BALL_STATES,
  HOVER_REARM_DISTANCE,
  DockedBallStateMachine
} = require("../src/services/floating-ball/docked-ball-state-machine");
const {
  DOCKED_BALL_VISUAL_CONFIG
} = require("../src/services/floating-ball/docked-ball-visual-config");

function createTimers() {
  let nextId = 1;
  const pending = new Map();

  return {
    setTimer(callback, delay) {
      const id = nextId++;
      pending.set(id, { callback, delay });
      return id;
    },
    clearTimer(id) {
      pending.delete(id);
    },
    runDelay(delay) {
      const matches = [...pending.entries()].filter(([, timer]) => timer.delay === delay);
      for (const [id, timer] of matches) {
        if (!pending.delete(id)) continue;
        timer.callback();
      }
    },
    count(delay) {
      return [...pending.values()].filter((timer) => timer.delay === delay).length;
    },
    get size() {
      return pending.size;
    }
  };
}

function createMachine() {
  const timers = createTimers();
  const transitions = [];
  const machine = new DockedBallStateMachine({
    hideDelayMs: 2000,
    hideAnimationMs: 560,
    revealAnimationMs: 580,
    animationGraceMs: 180,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    onStateChange(next, previous) {
      transitions.push([previous, next]);
    }
  });
  return { machine, timers, transitions };
}

test("production dock timing waits a full five seconds and keeps one timer", () => {
  const timers = createTimers();
  const machine = new DockedBallStateMachine({
    hideDelayMs: DOCKED_BALL_VISUAL_CONFIG.hideDelayMs,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer
  });

  machine.pointerEntered({ x: 100, y: 100 });
  machine.setDocked(true);
  assert.equal(timers.count(5000), 0);

  machine.pointerLeft({ x: 140, y: 100 });
  machine.pointerLeft({ x: 141, y: 100 });
  assert.equal(timers.count(5000), 1);

  machine.pointerEntered({ x: 100, y: 100 });
  assert.equal(timers.count(5000), 0);
  machine.pointerLeft({ x: 140, y: 100 });
  assert.equal(timers.count(5000), 1);
  timers.runDelay(5000);
  assert.equal(machine.state, BALL_STATES.HIDING);
});

test("periodic outside samples do not postpone the five second deadline", () => {
  const timers = createTimers();
  const machine = new DockedBallStateMachine({
    hideDelayMs: 5000,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer
  });

  machine.setDocked(true);
  machine.pointerLeft({ x: 200, y: 200 });
  for (let sample = 0; sample < 100; sample += 1) {
    machine.pointerLeft({ x: 200, y: 200 });
  }

  assert.equal(timers.count(5000), 1);
  timers.runDelay(5000);
  assert.equal(machine.state, BALL_STATES.HIDING);
});

test("a freely positioned ball never schedules automatic hiding", () => {
  const { machine, timers } = createMachine();

  machine.setDocked(false);
  machine.pointerLeft();

  assert.equal(machine.state, BALL_STATES.FLOATING);
  assert.equal(timers.size, 0);
});

test("a docked ball hides after two idle seconds", () => {
  const { machine, timers } = createMachine();

  machine.setDocked(true);
  assert.equal(machine.state, BALL_STATES.DOCKED_VISIBLE);
  assert.equal(timers.count(2000), 1);

  timers.runDelay(2000);
  assert.equal(machine.state, BALL_STATES.HIDING);
  assert.equal(timers.count(740), 1);

  assert.equal(machine.completeAnimation(BALL_STATES.HIDING), true);
  assert.equal(machine.state, BALL_STATES.DOCKED_HIDDEN);
});

test("pointer return cancels hiding and a later leave restarts the full delay", () => {
  const { machine, timers } = createMachine();

  machine.setDocked(true);
  machine.pointerEntered();
  assert.equal(timers.count(2000), 0);

  machine.pointerLeft();
  assert.equal(timers.count(2000), 1);
  machine.pointerEntered();
  assert.equal(timers.count(2000), 0);

  machine.pointerLeft();
  assert.equal(timers.count(2000), 1);
  timers.runDelay(2000);
  assert.equal(machine.state, BALL_STATES.HIDING);
});

test("menu interaction blocks hiding until the menu is closed and left", () => {
  const { machine, timers } = createMachine();

  machine.setDocked(true);
  machine.menuOpened();
  machine.pointerLeft();
  assert.equal(timers.count(2000), 0);

  machine.menuClosed();
  assert.equal(timers.count(2000), 1);
});

test("a zero-delay docked pointer leave enters hiding synchronously", () => {
  const timers = createTimers();
  const machine = new DockedBallStateMachine({
    hideDelayMs: 0,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer
  });

  machine.pointerEntered({ x: 100, y: 100 });
  machine.setDocked(true);
  assert.equal(machine.state, BALL_STATES.DOCKED_VISIBLE);

  machine.pointerLeft({ x: 200, y: 200 });
  assert.equal(machine.state, BALL_STATES.HIDING);
  assert.equal(timers.count(0), 0);
});

test("a zero-delay docked ball stays visible while the pointer is inside", () => {
  const timers = createTimers();
  const machine = new DockedBallStateMachine({
    hideDelayMs: 0,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer
  });

  machine.pointerEntered({ x: 100, y: 100 });
  machine.setDocked(true);

  assert.equal(machine.state, BALL_STATES.DOCKED_VISIBLE);
  assert.equal(timers.size, 0);
});

test("an outside pointer sync after reveal immediately restarts hiding", () => {
  const timers = createTimers();
  const machine = new DockedBallStateMachine({
    hideDelayMs: 0,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer
  });

  machine.pointerEntered({ x: 100, y: 100 });
  machine.setDocked(true);
  machine.pointerLeft({ x: 200, y: 200 });
  machine.completeAnimation(BALL_STATES.HIDING);
  machine.pointerEntered({ x: 100, y: 100 });
  machine.pointerLeft({ x: 200, y: 200 });
  machine.completeAnimation(BALL_STATES.REVEALING);
  assert.equal(machine.state, BALL_STATES.HIDING);
});

test("zero-delay reveal hands directly to hiding without a docked-visible frame", () => {
  for (const edge of ["left", "right", "top", "bottom"]) {
    const timers = createTimers();
    const transitions = [];
    const machine = new DockedBallStateMachine({
      hideDelayMs: 0,
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
      onStateChange(next, previous) {
        transitions.push({ edge, previous, next });
      }
    });

    machine.pointerEntered({ x: 100, y: 100 });
    machine.setDocked(true);
    machine.pointerLeft({ x: 140, y: 100 });
    machine.completeAnimation(BALL_STATES.HIDING);
    machine.pointerEntered({ x: 100, y: 100 });
    machine.pointerLeft({ x: 140, y: 100 });
    transitions.length = 0;

    assert.equal(machine.completeAnimation(BALL_STATES.REVEALING), true, edge);
    assert.equal(machine.state, BALL_STATES.HIDING, edge);
    assert.deepEqual(
      transitions.map(({ previous, next }) => [previous, next]),
      [[BALL_STATES.REVEALING, BALL_STATES.HIDING]],
      edge
    );
  }
});

test("zero-delay reveal still settles visible while the pointer remains inside", () => {
  const timers = createTimers();
  const machine = new DockedBallStateMachine({
    hideDelayMs: 0,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer
  });

  machine.pointerEntered({ x: 100, y: 100 });
  machine.setDocked(true);
  machine.pointerLeft({ x: 140, y: 100 });
  machine.completeAnimation(BALL_STATES.HIDING);
  machine.pointerEntered({ x: 100, y: 100 });

  assert.equal(machine.completeAnimation(BALL_STATES.REVEALING), true);
  assert.equal(machine.state, BALL_STATES.DOCKED_VISIBLE);
});

test("deferred resume waits for a fresh pointer sample before hiding", () => {
  const timers = createTimers();
  const machine = new DockedBallStateMachine({
    hideDelayMs: 0,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer
  });

  machine.setDocked(true);
  machine.suspend();
  machine.resume({ deferHide: true });

  assert.equal(machine.state, BALL_STATES.DOCKED_VISIBLE);
  machine.pointerEntered({ x: 100, y: 100 });
  assert.equal(machine.state, BALL_STATES.DOCKED_VISIBLE);
});

test("repeated global pointer samples support more than one hide and reveal cycle", () => {
  const timers = createTimers();
  const machine = new DockedBallStateMachine({
    hideDelayMs: 0,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer
  });

  machine.pointerEntered({ x: 100, y: 100 });
  machine.setDocked(true);

  for (let cycle = 0; cycle < 3; cycle += 1) {
    machine.pointerLeft({ x: 140, y: 100 });
    assert.equal(machine.state, BALL_STATES.HIDING, `hide cycle ${cycle + 1}`);
    machine.completeAnimation(BALL_STATES.HIDING);
    assert.equal(machine.state, BALL_STATES.DOCKED_HIDDEN, `hidden cycle ${cycle + 1}`);

    machine.pointerEntered({ x: 100, y: 100 });
    assert.equal(machine.state, BALL_STATES.REVEALING, `reveal cycle ${cycle + 1}`);
    machine.completeAnimation(BALL_STATES.REVEALING);
    assert.equal(machine.state, BALL_STATES.DOCKED_VISIBLE, `visible cycle ${cycle + 1}`);
  }
});

test("dragging closes menu state and restarts dock timing after release", () => {
  const { machine, timers } = createMachine();

  machine.setDocked(true);
  machine.menuOpened();
  machine.pointerLeft();
  assert.equal(machine.menuOpen, true);
  assert.equal(timers.count(2000), 0);

  machine.dragStarted();
  assert.equal(machine.menuOpen, false);
  assert.equal(machine.dragging, true);
  assert.equal(timers.size, 0);

  machine.dragEnded(true);
  assert.equal(machine.dragging, false);
  assert.equal(machine.state, BALL_STATES.DOCKED_VISIBLE);
  assert.equal(timers.count(2000), 1);
});

test("dragging from an open menu to floating does not leave timers behind", () => {
  const { machine, timers } = createMachine();

  machine.setDocked(true);
  machine.menuOpened();
  machine.dragStarted();
  machine.dragEnded(false);

  assert.equal(machine.menuOpen, false);
  assert.equal(machine.state, BALL_STATES.FLOATING);
  assert.equal(timers.size, 0);
});

test("entering during hide reverses to one reveal animation", () => {
  const { machine, timers, transitions } = createMachine();

  machine.setDocked(true);
  timers.runDelay(2000);
  machine.pointerEntered();
  machine.pointerEntered();

  assert.equal(machine.state, BALL_STATES.REVEALING);
  assert.equal(timers.count(760), 1);
  assert.equal(
    transitions.filter(([, next]) => next === BALL_STATES.REVEALING).length,
    1
  );

  machine.completeAnimation(BALL_STATES.REVEALING);
  assert.equal(machine.state, BALL_STATES.DOCKED_VISIBLE);
  assert.equal(timers.count(2000), 0);
});

test("a hidden ball reveals before dragging and only re-arms when re-docked", () => {
  const { machine, timers } = createMachine();

  machine.setDocked(true);
  timers.runDelay(2000);
  machine.completeAnimation(BALL_STATES.HIDING);
  assert.equal(machine.state, BALL_STATES.DOCKED_HIDDEN);

  machine.dragStarted();
  assert.equal(machine.state, BALL_STATES.DOCKED_VISIBLE);
  assert.equal(machine.dragging, true);

  machine.dragEnded(false);
  assert.equal(machine.state, BALL_STATES.FLOATING);
  assert.equal(timers.count(2000), 0);

  machine.dragStarted();
  machine.dragEnded(true);
  assert.equal(machine.state, BALL_STATES.DOCKED_VISIBLE);
  assert.equal(timers.count(2000), 1);
});

test("suspend and dispose cancel pending work", () => {
  const { machine, timers } = createMachine();

  machine.setDocked(true);
  machine.suspend();
  assert.equal(timers.size, 0);

  machine.resume();
  assert.equal(timers.count(2000), 1);

  machine.dispose();
  assert.equal(timers.size, 0);
});

test("the refined hidden pose uses the larger centralized visual configuration", () => {
  assert.equal(DOCKED_BALL_VISUAL_CONFIG.hiddenScale, 0.9);
  assert.notEqual(DOCKED_BALL_VISUAL_CONFIG.hiddenScale, 0.6);
  assert.deepEqual(
    [
      DOCKED_BALL_VISUAL_CONFIG.hiddenWindowWidth,
      DOCKED_BALL_VISUAL_CONFIG.hiddenWindowHeight
    ],
    [92, 118]
  );
  assert.equal(
    DOCKED_BALL_VISUAL_CONFIG.revealEntryMs +
      DOCKED_BALL_VISUAL_CONFIG.revealSettleMs,
    DOCKED_BALL_VISUAL_CONFIG.revealAnimationMs
  );
});

test("repeated leave events keep only one hide request", () => {
  const { machine, timers, transitions } = createMachine();

  machine.setDocked(true);
  machine.pointerLeft();
  machine.pointerLeft();

  assert.equal(timers.count(2000), 1);
  timers.runDelay(2000);
  assert.equal(machine.state, BALL_STATES.HIDING);
  assert.equal(
    transitions.filter(([, next]) => next === BALL_STATES.HIDING).length,
    1
  );
});

test("dragging during an animation invalidates its late completion", () => {
  const { machine, timers } = createMachine();

  machine.setDocked(true);
  timers.runDelay(2000);
  assert.equal(machine.state, BALL_STATES.HIDING);

  machine.dragStarted();
  assert.equal(machine.state, BALL_STATES.DOCKED_VISIBLE);
  assert.equal(machine.completeAnimation(BALL_STATES.HIDING), false);

  machine.dragEnded(false);
  assert.equal(machine.state, BALL_STATES.FLOATING);
  assert.equal(timers.size, 0);
});

test("disposing during an animation clears its completion guard", () => {
  const { machine, timers } = createMachine();

  machine.setDocked(true);
  timers.runDelay(2000);
  assert.equal(timers.count(740), 1);

  machine.dispose();
  assert.equal(timers.size, 0);
});

test("capture suspension preserves hidden hover state until a real post-resume sample", () => {
  const states = [];
  const machine = new DockedBallStateMachine({
    hideDelayMs: 0,
    hideAnimationMs: 10,
    revealAnimationMs: 10,
    onStateChange: (state) => states.push(state)
  });

  machine.setDocked(true);
  machine.pointerLeft({ x: 300, y: 300 });
  machine.completeAnimation(BALL_STATES.HIDING);
  assert.equal(machine.state, BALL_STATES.DOCKED_HIDDEN);

  machine.suspend();
  machine.pointerEntered({ x: 10, y: 10 });
  machine.pointerLeft({ x: 400, y: 400 });
  assert.equal(machine.state, BALL_STATES.DOCKED_HIDDEN);

  machine.resume();
  machine.pointerEntered({ x: 10, y: 10 });
  assert.equal(machine.state, BALL_STATES.REVEALING);
  assert.equal(states.filter((state) => state === BALL_STATES.REVEALING).length, 1);
});

test("hover reveal stays latched while the pointer has not truly left the edge zone", () => {
  const { machine, timers, transitions } = createMachine();

  machine.setDocked(true);
  timers.runDelay(2000);
  machine.completeAnimation(BALL_STATES.HIDING);
  machine.pointerEntered({ x: 100, y: 100 });
  machine.completeAnimation(BALL_STATES.REVEALING);

  machine.pointerLeft({ x: 101, y: 100 });
  timers.runDelay(2000);
  machine.completeAnimation(BALL_STATES.HIDING);
  machine.pointerEntered({ x: 101, y: 100 });

  assert.equal(machine.state, BALL_STATES.DOCKED_HIDDEN);
  assert.equal(
    transitions.filter(([, next]) => next === BALL_STATES.REVEALING).length,
    1
  );
});

test("hover reveal re-arms only after a real leave beyond the deadband", () => {
  const { machine, timers, transitions } = createMachine();

  machine.setDocked(true);
  timers.runDelay(2000);
  machine.completeAnimation(BALL_STATES.HIDING);
  machine.pointerEntered({ x: 200, y: 200 });
  machine.completeAnimation(BALL_STATES.REVEALING);
  machine.pointerLeft({ x: 200 + HOVER_REARM_DISTANCE, y: 200 });
  timers.runDelay(2000);
  machine.completeAnimation(BALL_STATES.HIDING);
  machine.pointerEntered({ x: 200, y: 200 });

  assert.equal(machine.state, BALL_STATES.REVEALING);
  assert.equal(
    transitions.filter(([, next]) => next === BALL_STATES.REVEALING).length,
    2
  );
});

test("full display mode still schedules the docked character auto-hide", () => {
  const timers = createTimers();
  const machine = new DockedBallStateMachine({
    displayMode: BALL_DISPLAY_MODES.FULL,
    hideDelayMs: 2000,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer
  });

  machine.setDocked(true);
  machine.pointerLeft();

  assert.equal(machine.state, BALL_STATES.DOCKED_VISIBLE);
  assert.equal(timers.count(2000), 1);
  timers.runDelay(2000);
  assert.equal(machine.state, BALL_STATES.HIDING);
  assert.equal(machine.completeAnimation(BALL_STATES.HIDING), true);
  assert.equal(machine.state, BALL_STATES.DOCKED_HIDDEN);
});

test("quiet edge mode stays hidden and ignores pointer reveal", () => {
  const { machine, timers } = createMachine();

  machine.setDisplayMode(BALL_DISPLAY_MODES.QUIET_EDGE);
  machine.setDocked(true);
  assert.equal(machine.state, BALL_STATES.DOCKED_HIDDEN);

  machine.pointerEntered();
  assert.equal(machine.state, BALL_STATES.DOCKED_HIDDEN);
  assert.equal(timers.size, 0);

  machine.dragStarted();
  assert.equal(machine.state, BALL_STATES.DOCKED_VISIBLE);
  machine.dragEnded(true);
  assert.equal(machine.state, BALL_STATES.DOCKED_HIDDEN);
});

test("every dock edge uses the same dock-visible to auto-hide state chain", () => {
  for (const edge of ["left", "right", "top", "bottom"]) {
    const timers = createTimers();
    const transitions = [];
    const machine = new DockedBallStateMachine({
      displayMode: BALL_DISPLAY_MODES.FULL,
      hideDelayMs: 2000,
      hideAnimationMs: 560,
      animationGraceMs: 180,
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
      onStateChange(next, previous) {
        transitions.push({ edge, previous, next });
      }
    });

    machine.dragStarted();
    machine.dragEnded(true);

    assert.equal(machine.dragging, false, edge);
    assert.equal(machine.menuOpen, false, edge);
    assert.equal(machine.state, BALL_STATES.DOCKED_VISIBLE, edge);
    assert.equal(timers.count(2000), 1, edge);

    timers.runDelay(2000);
    assert.equal(machine.state, BALL_STATES.HIDING, edge);
    assert.equal(timers.count(740), 1, edge);
    assert.equal(machine.completeAnimation(BALL_STATES.HIDING), true, edge);
    assert.equal(machine.state, BALL_STATES.DOCKED_HIDDEN, edge);
    assert.deepEqual(
      transitions.map(({ next }) => next),
      [BALL_STATES.DOCKED_VISIBLE, BALL_STATES.HIDING, BALL_STATES.DOCKED_HIDDEN],
      edge
    );
  }
});

test("hover and menu state block hide only until they are cleared", () => {
  const { machine, timers } = createMachine();

  machine.setDisplayMode(BALL_DISPLAY_MODES.FULL);
  machine.setDocked(true);
  machine.pointerEntered();
  machine.menuOpened();
  assert.equal(timers.count(2000), 0);

  machine.menuClosed();
  assert.equal(timers.count(2000), 0);

  machine.pointerLeft();
  assert.equal(timers.count(2000), 1);
});

test("complete UI visibility suspension does not turn into docked-hidden state", () => {
  const { machine, timers } = createMachine();

  machine.setDisplayMode(BALL_DISPLAY_MODES.FULL);
  machine.setDocked(true);
  machine.suspend();

  assert.equal(machine.state, BALL_STATES.DOCKED_VISIBLE);
  assert.equal(timers.size, 0);

  machine.resume();
  assert.equal(machine.state, BALL_STATES.DOCKED_VISIBLE);
  assert.equal(timers.count(2000), 1);
});
