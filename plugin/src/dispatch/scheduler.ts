// @ts-nocheck

import {
  activeStepsForState,
  boundedDispatchBudgets,
  hasExclusiveLiveStep,
  selectRunnableCapabilityHandSteps,
  selectRunnableProbeSteps,
} from './concurrency.js';

export function serialDispatchBudgets() {
  return boundedDispatchBudgets();
}

function firstReadyActor(state, actors = [], kind) {
  const readyStepIds = new Set(state?.readyStepIds || []);
  for (const actor of actors) {
    if (!actor) continue;
    const stepId = Object.entries(state?.graph?.steps || {}).find(([, step]) => step.actor === actor && step.kind === kind)?.[0];
    if (stepId && readyStepIds.has(stepId)) return actor;
  }
  return '';
}

export function selectNextDispatchPlan(state, options = {}) {
  if (!state?.mode || state.mode !== 'harness') return { dispatches: [], reason: 'not_harness' };

  const budgets = { ...serialDispatchBudgets(), ...(options.budgets || {}) };
  const allowedKinds = new Set(options.allowedKinds || ['manager', 'capability-hand', 'probe', 'acceptance-closure']);
  const activeSteps = activeStepsForState(state);
  const activeCapabilityHands = activeSteps.filter((step) => step.kind === 'capability-hand');
  const activeProbes = activeSteps.filter((step) => step.kind === 'probe');

  if (activeSteps.some((step) => step.kind === 'manager' || step.kind === 'acceptance-closure')) {
    return { dispatches: [], reason: 'active_dispatch_in_progress' };
  }

  const nextManager = firstReadyActor(state, state.pendingManagers || [], 'manager');

  if (budgets.managers > 0 && allowedKinds.has('manager') && ['feature-planner', 'capability-planner', 'planning-manager', 'execution-manager'].includes(nextManager)) {
    if (activeSteps.length > 0) return { dispatches: [], reason: 'active_dispatch_in_progress' };
    return { dispatches: [{ kind: 'manager', actor: nextManager, reason: 'pending_manager' }], reason: 'pending_manager' };
  }

  if (budgets.hands > 0 && allowedKinds.has('capability-hand') && state.dispatchedManagers?.includes('execution-manager') && !hasExclusiveLiveStep(state)) {
    const dispatches = selectRunnableCapabilityHandSteps(state, { budget: budgets.hands });
    if (dispatches.length > 0) return { dispatches, reason: 'pending_capability_hand' };
    if (activeCapabilityHands.length > 0) return { dispatches: [], reason: 'active_dispatch_in_progress' };
  }

  if (budgets.managers > 0 && allowedKinds.has('manager') && nextManager === 'acceptance-manager') {
    if (activeSteps.length > 0) return { dispatches: [], reason: 'active_dispatch_in_progress' };
    return { dispatches: [{ kind: 'manager', actor: nextManager, reason: 'pending_acceptance_manager' }], reason: 'pending_acceptance_manager' };
  }

  if (budgets.probes > 0 && allowedKinds.has('probe') && state.dispatchedManagers?.includes('acceptance-manager')) {
    const dispatches = selectRunnableProbeSteps(state, { budget: budgets.probes });
    if (dispatches.length > 0) return { dispatches, reason: 'pending_probe' };
    if (activeProbes.length > 0) return { dispatches: [], reason: 'active_dispatch_in_progress' };
  }

  const acceptanceClosureReady = firstReadyActor(state, ['acceptance-manager'], 'acceptance-closure');
  if (allowedKinds.has('acceptance-closure') && state.dispatchedManagers?.includes('acceptance-manager') && acceptanceClosureReady) {
    if (activeSteps.length > 0) return { dispatches: [], reason: 'active_dispatch_in_progress' };
    return { dispatches: [{ kind: 'acceptance-closure', actor: 'acceptance-manager', reason: 'ready_for_acceptance_closure' }], reason: 'ready_for_acceptance_closure' };
  }

  return { dispatches: [], reason: 'no_runnable_serial_dispatch' };
}

export function selectNextSerialDispatch(state, options = {}) {
  const plan = selectNextDispatchPlan(state, options);
  return plan.dispatches[0] || { kind: 'none', reason: plan.reason };
}
