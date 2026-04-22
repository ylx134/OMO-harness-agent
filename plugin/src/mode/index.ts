type DispatchBudgets = {
  managers: number;
  hands: number;
  probes: number;
};

type RuntimeRolloutConfig = {
  mode?: string;
  budgets?: Partial<DispatchBudgets>;
};

type RuntimeRolloutState = {
  graphRuntimeRollout?: RuntimeRolloutConfig;
  autopilotEnabled?: boolean;
} | null;

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

function normalizeBudgetValue(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
}

function normalizeBudgets(budgets: Partial<DispatchBudgets> = {}, defaults: DispatchBudgets = SERIAL_COMPAT_BUDGETS) {
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

export function createGraphRuntimeRollout(config: RuntimeRolloutConfig = {}) {
  const mode = config.mode === 'bounded-concurrency' ? 'bounded-concurrency' : 'serial-compat';
  const defaults = mode === 'bounded-concurrency'
    ? BOUNDED_CONCURRENCY_BUDGETS
    : SERIAL_COMPAT_BUDGETS;

  return {
    mode,
    budgets: normalizeBudgets(config.budgets, defaults),
  };
}

export function resolveGraphRuntimeRollout(state: RuntimeRolloutState = null) {
  if (state?.graphRuntimeRollout?.mode) {
    return createGraphRuntimeRollout(state.graphRuntimeRollout);
  }

  if (state?.autopilotEnabled === true) {
    return createGraphRuntimeRollout({ mode: 'serial-compat' });
  }

  return createGraphRuntimeRollout({ mode: 'serial-compat' });
}

export function rolloutBudgetsForState(state: RuntimeRolloutState = null, overrides: Partial<DispatchBudgets> = {}) {
  const rollout = resolveGraphRuntimeRollout(state);
  return normalizeBudgets(overrides, rollout.budgets);
}

export { BOUNDED_CONCURRENCY_BUDGETS, SERIAL_COMPAT_BUDGETS };
