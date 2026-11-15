const path = require("path");
const { app, globalShortcut } = require("electron");
const { ACTION_DEFINITIONS, ACTIONS, DEFAULT_BINDINGS } = require("./defaults");
const { actionIsActive, actionsCanConflict } = require("./hotkey-policy");
const { bindingKey, cloneBindings, normalizeBinding } = require("./binding-utils");
const { HotkeyStore } = require("./hotkey-store");
const { HotkeyTriggerGuard } = require("./hotkey-trigger-guard");

class HotkeyManager {
  constructor(onAction, options = {}) {
    this.onAction = onAction;
    this.onRegistrationIssue = options.onRegistrationIssue || (() => {});
    this.store = new HotkeyStore(path.join(app.getPath("userData"), "hotkeys.json"), DEFAULT_BINDINGS);
    this.bindings = this.store.load();
    this.registrationStatus = new Map();
    this.registeredAccelerators = new Set();
    this.context = { mode: "normal", gameRegionsActive: false };
    this.captureActive = false;
    this.triggerGuard = new HotkeyTriggerGuard();
    this.dispatchDepth = 0;
    this.reconcilePending = false;
    this.reconcileScheduled = false;
    this.disposed = false;
    this.deferReconcile = options.deferReconcile || ((callback) => setImmediate(callback));
  }
  start() { this.store.save(this.bindings); this.reconcileRegistrations(); }
  setContext(changes) {
    const nextContext = { ...this.context, ...changes };
    if (Object.keys(nextContext).every((key) => nextContext[key] === this.context[key])) {
      return this.getSnapshot();
    }
    this.context = nextContext;
    this.requestReconcile();
    return this.getSnapshot();
  }
  requestReconcile() {
    if (this.dispatchDepth > 0) {
      this.reconcilePending = true;
      return;
    }
    this.reconcileRegistrations();
  }
  schedulePendingReconcile() {
    if (!this.reconcilePending || this.reconcileScheduled || this.disposed) return;
    this.reconcilePending = false;
    this.reconcileScheduled = true;
    this.deferReconcile(() => {
      this.reconcileScheduled = false;
      if (!this.disposed) this.reconcileRegistrations();
    });
  }
  isActionActive(action) { return actionIsActive(ACTION_DEFINITIONS[action], this.context); }
  reconcileRegistrations() {
    this.unregisterManagedKeyboardBindings();
    for (const [action, bindings] of Object.entries(this.bindings)) {
      if (!this.isActionActive(action)) {
        for (const binding of bindings) this.registrationStatus.set(binding.id, { active: false, inactiveForMode: true, error: "" });
        continue;
      }
      for (const binding of bindings) this.registerKeyboard(binding, action);
    }
  }
  registerKeyboard(binding, action) {
    try {
      const registered = globalShortcut.register(binding.accelerator, () => {
        if (this.captureActive || !this.isActionActive(action)) return;
        this.dispatchDepth += 1;
        try {
          const triggeredAt = Date.now();
          this.triggerGuard.run(binding.accelerator, () => this.onAction(action, { triggeredAt }));
        } finally {
          this.dispatchDepth -= 1;
          if (this.dispatchDepth === 0) this.schedulePendingReconcile();
        }
      });
      const error = registered ? "" : "该快捷键已被其他程序或 Windows 占用";
      this.registrationStatus.set(binding.id, { active: registered, error });
      if (registered) this.registeredAccelerators.add(binding.accelerator);
      else this.onRegistrationIssue({ action, binding, error });
      return registered;
    } catch {
      const error = "该快捷键无法注册";
      this.registrationStatus.set(binding.id, { active: false, error });
      this.onRegistrationIssue({ action, binding, error });
      return false;
    }
  }
  beginCapture() { this.captureActive = true; }
  endCapture() { this.captureActive = false; }
  findConflict(candidate, excludedBindingId, candidateAction) {
    const key = bindingKey(candidate);
    for (const [action, bindings] of Object.entries(this.bindings)) {
      if (!actionsCanConflict(ACTION_DEFINITIONS[candidateAction], ACTION_DEFINITIONS[action])) continue;
      const conflict = bindings.find((binding) => binding.id !== excludedBindingId && bindingKey(binding) === key);
      if (conflict) return { action, binding: conflict };
    }
    return null;
  }
  saveBinding(action, candidate, bindingId = null) {
    if (!(action in ACTIONS)) return { ok: false, message: "未知功能" };
    let binding;
    try { binding = normalizeBinding(candidate, bindingId || undefined); }
    catch (error) { return { ok: false, message: error.message }; }
    const conflict = this.findConflict(binding, bindingId, action);
    if (conflict) return { ok: false, message: `该按键已用于“${ACTIONS[conflict.action]}”` };
    const current = this.bindings[action];
    const oldIndex = bindingId ? current.findIndex((item) => item.id === bindingId) : -1;
    const previous = oldIndex >= 0 ? current[oldIndex] : null;
    if (oldIndex >= 0) current.splice(oldIndex, 1, binding); else current.push(binding);
    this.reconcileRegistrations();
    const status = this.registrationStatus.get(binding.id);
    if (this.isActionActive(action) && !status?.active) {
      if (oldIndex >= 0) current.splice(oldIndex, 1, previous); else current.pop();
      this.reconcileRegistrations();
      return { ok: false, message: status?.error || "快捷键无法注册" };
    }
    this.store.save(this.bindings);
    this.endCapture();
    return { ok: true, snapshot: this.getSnapshot() };
  }
  deleteBinding(action, bindingId) {
    if (!(action in ACTIONS)) return { ok: false, message: "未知功能" };
    const index = this.bindings[action].findIndex((item) => item.id === bindingId);
    if (index < 0) return { ok: false, message: "绑定不存在" };
    this.bindings[action].splice(index, 1);
    this.store.save(this.bindings);
    this.reconcileRegistrations();
    return { ok: true, snapshot: this.getSnapshot() };
  }
  resetAction(action) {
    if (!(action in ACTIONS)) return { ok: false, message: "未知功能" };
    const defaults = this.store.getDefaults()[action] || [];
    for (const candidate of defaults) {
      const key = bindingKey(candidate);
      for (const [otherAction, bindings] of Object.entries(this.bindings)) {
        if (otherAction === action) continue;
        if (!actionsCanConflict(ACTION_DEFINITIONS[action], ACTION_DEFINITIONS[otherAction])) continue;
        if (bindings.some((binding) => bindingKey(binding) === key)) {
          return { ok: false, message: `默认按键已用于“${ACTIONS[otherAction]}”` };
        }
      }
    }
    const previous = cloneBindings(this.bindings[action]);
    this.bindings[action] = defaults;
    this.reconcileRegistrations();
    const registrationFailed = this.isActionActive(action) && defaults.some((binding) => {
      const status = this.registrationStatus.get(binding.id);
      return !status?.active;
    });
    if (registrationFailed) {
      this.bindings[action] = previous;
      this.reconcileRegistrations();
      return { ok: false, message: "该项目的默认快捷键被其他程序占用，未进行修改" };
    }
    this.store.save(this.bindings);
    this.endCapture();
    return { ok: true, snapshot: this.getSnapshot() };
  }
  resetDefaults() {
    const previous = cloneBindings(this.bindings);
    this.bindings = this.store.getDefaults();
    this.reconcileRegistrations();
    if ([...this.registrationStatus.values()].some((status) => status.error)) {
      this.bindings = previous; this.reconcileRegistrations();
      return { ok: false, message: "当前模式的默认快捷键被其他程序占用，未进行修改" };
    }
    this.store.save(this.bindings); this.endCapture();
    return { ok: true, snapshot: this.getSnapshot() };
  }
  getSnapshot() {
    return {
      mode: this.context.mode,
      actions: Object.entries(ACTIONS).map(([id, name]) => ({
        id, name, group: ACTION_DEFINITIONS[id].group,
        recommendation: ACTION_DEFINITIONS[id].recommendation || "",
        enabledForMode: this.isActionActive(id),
        bindings: this.bindings[id].map((binding) => ({ ...binding, ...(this.registrationStatus.get(binding.id) || { active: false }) }))
      }))
    };
  }
  unregisterManagedKeyboardBindings() {
    for (const accelerator of this.registeredAccelerators) globalShortcut.unregister(accelerator);
    this.registeredAccelerators.clear(); this.registrationStatus.clear();
  }
  dispose() {
    this.disposed = true;
    this.reconcilePending = false;
    this.endCapture();
    this.triggerGuard.clear();
    this.unregisterManagedKeyboardBindings();
  }
}
module.exports = { HotkeyManager };
