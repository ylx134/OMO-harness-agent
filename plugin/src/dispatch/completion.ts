// @ts-nocheck

import { createDefaultStepRuntime } from '../state/schema.js';
import { recoverGraphRuntimeState } from './recovery.js';
import { emitSignalsForStep } from './signals.js';

function nowIso() {
  return new Date().toISOString();
}

function terminalStatuses() {
  return new Set(['succeeded', 'terminal_error', 'skipped']);
}

function isTerminal(status) {
  return terminalStatuses().has(status);
}

function closureReachableAncestorStepIds(graph, closureStepId) {
  const reachable = new Set();
  const pending = [...(graph?.steps?.[closureStepId]?.dependsOnStepIds || [])];

  while (pending.length > 0) {
    const stepId = pending.pop();
    if (!stepId || reachable.has(stepId)) continue;
    reachable.add(stepId);
    for (const dependencyStepId of graph?.steps?.[stepId]?.dependsOnStepIds || []) {
      pending.push(dependencyStepId);
    }
  }

  return reachable;
}

function graphCompleteForClosure(state, closureStepId) {
  const relevantStepIds = closureReachableAncestorStepIds(state?.graph, closureStepId);
  return Array.from(relevantStepIds).every((stepId) => isTerminal(state?.stepRuntime?.[stepId]?.status));
}

export function canStepCompleteFromSource(state, stepId, source) {
  const step = state?.graph?.steps?.[stepId];
  if (!step) return false;

  if (step.kind === 'manager') {
    if (['planning-manager', 'capability-planner', 'feature-planner'].includes(step.actor)) {
      return ['workspace-artifact', 'session-store', 'chat', 'tool'].includes(source);
    }
    return ['session-store', 'chat', 'tool'].includes(source);
  }

  if (step.kind === 'capability-hand' || step.kind === 'probe') {
    return ['session-store', 'chat', 'tool'].includes(source);
  }

  if (step.kind === 'acceptance-closure') {
    return ['session-store', 'chat', 'tool'].includes(source);
  }

  return false;
}

export function completeGraphStep(state, {
  stepId,
  source,
  completedAt = nowIso(),
  deliverablesSatisfied = false,
} = {}) {
  const step = state?.graph?.steps?.[stepId];
  if (!step) return { state: recoverGraphRuntimeState(state), changed: false, reason: 'unknown_step' };

  if (!canStepCompleteFromSource(state, stepId, source)) {
    return { state: recoverGraphRuntimeState(state), changed: false, reason: 'source_not_allowed' };
  }

  const current = createDefaultStepRuntime(state.stepRuntime?.[stepId] || {});
  if (isTerminal(current.status)) {
    return { state: recoverGraphRuntimeState(state), changed: false, reason: 'already_terminal' };
  }

  if (step.kind === 'acceptance-closure') {
    if (!deliverablesSatisfied || !graphCompleteForClosure(state, stepId)) {
      return { state: recoverGraphRuntimeState(state), changed: false, reason: 'graph_or_deliverables_incomplete' };
    }
  }

  const nextState = recoverGraphRuntimeState({
    ...state,
    activeDispatch: state.activeDispatch?.stepId === stepId ? null : state.activeDispatch,
    signals: emitSignalsForStep(state.graph, state.signals || {}, stepId, completedAt),
    stepRuntime: {
      ...(state.stepRuntime || {}),
      [stepId]: {
        ...current,
        status: 'succeeded',
        activeSessionID: null,
        completedAt: current.completedAt || completedAt,
        lastProgressAt: completedAt,
        completionSource: source,
        lastError: null,
      },
    },
    retryQueue: (state.retryQueue || []).filter((queuedStepId) => queuedStepId !== stepId),
  });

  return { state: nextState, changed: true, reason: 'completed' };
}
