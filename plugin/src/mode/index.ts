// @ts-nocheck

const SERIAL_COMPAT_BUDGETS = Object.freeze({
  managers: 1,
  hands: 1,
  probes: 1,
});

const BOUNDED_CONCURRENCY_BUDGETS = Object.freeze({
  managers: 1,
  hands: 2,
  probes: 2,
});

function normalizeBudgetValue(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
}

function normalizeBudgets(budgets = {}, defaults = SERIAL_COMPAT_BUDGETS) {
  return {
    managers: normalizeBudgetValue(budgets.managers, defaults.managers),
    hands: normalizeBudgetValue(budgets.hands, defaults.hands),
    probes: normalizeBudgetValue(budgets.probes, defaults.probes),
  };
}

export function isManualHarnessMode(message = '') {
  const msg = String(message || '').toLowerCase();
  return msg.includes('--manual') || msg.includes('手动推进');
}

export function createGraphRuntimeRollout(config = {}) {
  const mode = config.mode === 'bounded-concurrency' ? 'bounded-concurrency' : 'serial-compat';
  const defaults = mode === 'bounded-concurrency'
    ? BOUNDED_CONCURRENCY_BUDGETS
    : SERIAL_COMPAT_BUDGETS;

  return {
    mode,
    budgets: normalizeBudgets(config.budgets, defaults),
  };
}

export function resolveGraphRuntimeRollout(state = null) {
  if (state?.graphRuntimeRollout?.mode) {
    return createGraphRuntimeRollout(state.graphRuntimeRollout);
  }

  if (state?.autopilotEnabled === true) {
    return createGraphRuntimeRollout({ mode: 'serial-compat' });
  }

  return createGraphRuntimeRollout({ mode: 'serial-compat' });
}

export function rolloutBudgetsForState(state = null, overrides = {}) {
  const rollout = resolveGraphRuntimeRollout(state);
  return normalizeBudgets(overrides, rollout.budgets);
}

export { BOUNDED_CONCURRENCY_BUDGETS, SERIAL_COMPAT_BUDGETS };
