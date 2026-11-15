const BALL_STATES = Object.freeze({
  FLOATING: "floating",
  DOCKED_VISIBLE: "docked-visible",
  HIDING: "hiding",
  DOCKED_HIDDEN: "docked-hidden",
  REVEALING: "revealing"
});

const BALL_DISPLAY_MODES = Object.freeze({
  AUTO_HIDE: "auto-hide",
  FULL: "full",
  QUIET_EDGE: "quiet-edge"
});

const HOVER_REARM_DISTANCE = 14;

function pointerDistance(from, to) {
  if (!from || !to) return 0;
  return Math.hypot(
    (Number(to.x) || 0) - (Number(from.x) || 0),
    (Number(to.y) || 0) - (Number(from.y) || 0)
  );
}

class DockedBallStateMachine {
  constructor({
    hideDelayMs = 2000,
    hideAnimationMs = 560,
    revealAnimationMs = 580,
    displayMode = BALL_DISPLAY_MODES.AUTO_HIDE,
    animationGraceMs = 180,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    onStateChange = () => {}
  } = {}) {
    this.hideDelayMs = hideDelayMs;
    this.hideAnimationMs = hideAnimationMs;
    this.revealAnimationMs = revealAnimationMs;
    this.displayMode = displayMode;
    this.animationGraceMs = animationGraceMs;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.onStateChange = onStateChange;
    this.state = BALL_STATES.FLOATING;
    this.docked = false;
    this.pointerInside = false;
    this.menuOpen = false;
    this.dragging = false;
    this.suspended = false;
    this.hoverRevealArmed = true;
    this.hoverRevealPoint = null;
    this.hideTimer = null;
    this.hideTimerGeneration = 0;
    this.animationTimer = null;
  }

  transition(nextState) {
    if (this.state === nextState) return;
    const previousState = this.state;
    this.clearAnimationTimer();
    this.state = nextState;
    this.onStateChange(nextState, previousState);

    if (nextState === BALL_STATES.HIDING) {
      this.animationTimer = this.setTimer(
        () => this.completeAnimation(BALL_STATES.HIDING),
        this.hideAnimationMs + this.animationGraceMs
      );
    } else if (nextState === BALL_STATES.REVEALING) {
      this.animationTimer = this.setTimer(
        () => this.completeAnimation(BALL_STATES.REVEALING),
        this.revealAnimationMs + this.animationGraceMs
      );
    }
  }

  clearHideTimer() {
    this.hideTimerGeneration += 1;
    if (this.hideTimer !== null) this.clearTimer(this.hideTimer);
    this.hideTimer = null;
  }

  clearAnimationTimer() {
    if (this.animationTimer !== null) this.clearTimer(this.animationTimer);
    this.animationTimer = null;
  }

  canHide() {
    return Boolean(
      this.docked &&
      this.displayMode !== BALL_DISPLAY_MODES.QUIET_EDGE &&
      !this.pointerInside &&
      !this.menuOpen &&
      !this.dragging &&
      !this.suspended &&
      this.state === BALL_STATES.DOCKED_VISIBLE
    );
  }

  scheduleHide() {
    if (!this.canHide()) {
      this.clearHideTimer();
      return;
    }
    if (this.hideDelayMs <= 0) {
      this.clearHideTimer();
      this.transition(BALL_STATES.HIDING);
      return;
    }
    if (this.hideTimer !== null) return;
    const generation = ++this.hideTimerGeneration;
    this.hideTimer = this.setTimer(() => {
      if (generation !== this.hideTimerGeneration) return;
      this.hideTimer = null;
      if (this.canHide()) this.transition(BALL_STATES.HIDING);
    }, this.hideDelayMs);
  }

  setDocked(docked) {
    this.docked = Boolean(docked);
    this.clearHideTimer();
    if (!this.docked) {
      this.transition(BALL_STATES.FLOATING);
      return;
    }
    if (this.displayMode === BALL_DISPLAY_MODES.QUIET_EDGE) {
      this.transition(BALL_STATES.DOCKED_HIDDEN);
      return;
    }
    if (this.state === BALL_STATES.FLOATING) {
      this.transition(BALL_STATES.DOCKED_VISIBLE);
    }
    this.scheduleHide();
  }

  setDisplayMode(displayMode) {
    this.displayMode = Object.values(BALL_DISPLAY_MODES).includes(displayMode)
      ? displayMode
      : BALL_DISPLAY_MODES.AUTO_HIDE;
    this.clearHideTimer();

    if (!this.docked) {
      this.transition(BALL_STATES.FLOATING);
      return;
    }
    if (this.displayMode === BALL_DISPLAY_MODES.QUIET_EDGE) {
      this.transition(BALL_STATES.DOCKED_HIDDEN);
      return;
    }
    if ([BALL_STATES.HIDING, BALL_STATES.DOCKED_HIDDEN].includes(this.state)) {
      this.transition(BALL_STATES.REVEALING);
      return;
    }
    if (this.state === BALL_STATES.FLOATING) {
      this.transition(BALL_STATES.DOCKED_VISIBLE);
    }
    this.scheduleHide();
  }

  pointerEntered(point = null) {
    if (this.suspended) return;
    this.pointerInside = true;
    this.clearHideTimer();
    if (this.displayMode === BALL_DISPLAY_MODES.QUIET_EDGE) return;
    if ([BALL_STATES.HIDING, BALL_STATES.DOCKED_HIDDEN].includes(this.state)) {
      if (!this.hoverRevealArmed) return;
      this.hoverRevealArmed = false;
      this.hoverRevealPoint = point;
      this.transition(BALL_STATES.REVEALING);
    }
  }

  pointerLeft(point = null) {
    if (this.suspended) return;
    this.pointerInside = false;
    if (
      !this.hoverRevealArmed &&
      pointerDistance(this.hoverRevealPoint, point) >= HOVER_REARM_DISTANCE
    ) {
      this.hoverRevealArmed = true;
      this.hoverRevealPoint = null;
    }
    this.scheduleHide();
  }

  menuOpened() {
    this.menuOpen = true;
    this.clearHideTimer();
    if (this.displayMode === BALL_DISPLAY_MODES.QUIET_EDGE) return;
    if ([BALL_STATES.HIDING, BALL_STATES.DOCKED_HIDDEN].includes(this.state)) {
      this.transition(BALL_STATES.REVEALING);
    }
  }

  menuClosed() {
    this.menuOpen = false;
    this.scheduleHide();
  }

  reveal() {
    this.clearHideTimer();
    if (this.displayMode === BALL_DISPLAY_MODES.QUIET_EDGE) return;
    if ([BALL_STATES.HIDING, BALL_STATES.DOCKED_HIDDEN].includes(this.state)) {
      this.transition(BALL_STATES.REVEALING);
    }
  }

  dragStarted() {
    this.dragging = true;
    this.menuOpen = false;
    this.clearHideTimer();
    this.hoverRevealArmed = true;
    this.hoverRevealPoint = null;
    this.transition(this.docked ? BALL_STATES.DOCKED_VISIBLE : BALL_STATES.FLOATING);
  }

  dragEnded(docked) {
    this.dragging = false;
    this.setDocked(docked);
  }

  completeAnimation(animationState) {
    if (this.state !== animationState) return false;
    this.clearAnimationTimer();
    if (animationState === BALL_STATES.HIDING) {
      if (!this.canCompleteHide()) {
        this.transition(BALL_STATES.REVEALING);
      } else {
        this.transition(BALL_STATES.DOCKED_HIDDEN);
      }
      return true;
    }
    if (
      this.hideDelayMs <= 0 &&
      this.canCompleteHide()
    ) {
      this.transition(BALL_STATES.HIDING);
      return true;
    }
    this.transition(this.docked ? BALL_STATES.DOCKED_VISIBLE : BALL_STATES.FLOATING);
    this.scheduleHide();
    return true;
  }

  canCompleteHide() {
    return Boolean(
      this.docked &&
      this.displayMode !== BALL_DISPLAY_MODES.QUIET_EDGE &&
      !this.pointerInside &&
      !this.menuOpen &&
      !this.dragging &&
      !this.suspended
    );
  }

  suspend() {
    this.suspended = true;
    this.clearHideTimer();
    if ([BALL_STATES.HIDING, BALL_STATES.REVEALING].includes(this.state)) {
      this.transition(this.docked ? BALL_STATES.DOCKED_VISIBLE : BALL_STATES.FLOATING);
    }
  }

  resume({ deferHide = false } = {}) {
    this.suspended = false;
    if (!deferHide) this.scheduleHide();
  }

  dispose() {
    this.suspended = true;
    this.clearHideTimer();
    this.clearAnimationTimer();
  }
}

module.exports = {
  BALL_DISPLAY_MODES,
  BALL_STATES,
  HOVER_REARM_DISTANCE,
  DockedBallStateMachine
};
