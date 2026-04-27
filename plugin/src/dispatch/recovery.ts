// @ts-nocheck

import { projectLegacyState } from '../state/legacy-projection.js';
import { deriveNextExpectedActor } from '../state/next-expected-actor.js';
import { createDefaultStepRuntime, normalizeStepRuntime } from '../state/schema.js';
import { deriveHeldLocks } from './concurrency.js';
import { deriveSignalSchedulingState, normalizeSignals } from './signals.js';

function nowIso() {
  return new Date().toISOString();
}

function activeStatuses() {
  return new Set(['dispatching', 'in_progress', 'waiting']);
}

function dedupe(values = []) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

export function stepIdForActorPhase(state, actor, phase) {
  const explicitPhase = phase === 'acceptance-closure' ? 'acceptance-closure' : phase === 'capability-hand' ? 'capability-hand' : phase === 'probe' ? 'probe' : 'manager';
  const direct = `${explicitPhase}:${actor}`;
  if (state?.graph?.steps?.[direct]) return direct;

  const match = Object.entries(state?.graph?.steps || {}).find(([, step]) => step.actor === actor && step.kind === explicitPhase);
  return match?.[0] || null;
}

export function recoverGraphRuntimeState(state) {
  if (!state) return null;

  const stepRuntime = normalizeStepRuntime(state.graph, state.stepRuntime || {});
  const activeStepIds = [];
  const retryQueue = [];

  for (const [stepId, runtime] of Object.entries(stepRuntime)) {
    const normalized = createDefaultStepRuntime(runtime || {});
    stepRuntime[stepId] = normalized;
    if (activeStatuses().has(normalized.status)) activeStepIds.push(stepId);
    if (normalized.status === 'retryable_error') retryQueue.push(stepId);
  }

  const signals = normalizeSignals(state.graph, state.signals || {});

  const projected = projectLegacyState({
    ...state,
    stepRuntime,
  });

  const signalSchedulingState = deriveSignalSchedulingState(state.graph, stepRuntime, signals);
  const heldLocks = deriveHeldLocks(state.graph, stepRuntime);

  const requestedActiveStepId = state?.activeDispatch?.stepId || stepIdForActorPhase(state, state?.activeDispatch?.actor, state?.activeDispatch?.phase);
  const activeDispatch = requestedActiveStepId && activeStatuses().has(stepRuntime[requestedActiveStepId]?.status)
    ? {
        actor: state.activeDispatch?.actor || state.graph?.steps?.[requestedActiveStepId]?.actor || projected.activeDispatch?.actor || null,
        phase: state.activeDispatch?.phase || projected.activeDispatch?.phase || null,
        sessionID: state.activeDispatch?.sessionID || stepRuntime[requestedActiveStepId]?.activeSessionID || null,
        stepId: requestedActiveStepId,
        startedAt: state.activeDispatch?.startedAt || stepRuntime[requestedActiveStepId]?.startedAt || null,
      }
    : projected.activeDispatch;

  const nextExpectedActor = deriveNextExpectedActor({
    ...state,
    compat: undefined,
    nextExpectedActor: undefined,
    stepRuntime,
    graph: state.graph,
    activeStepIds,
    activeDispatch,
    pendingManagers: projected.pendingManagers,
    pendingCapabilityHands: projected.pendingCapabilityHands,
    pendingProbes: projected.pendingProbes,
    deferredDispatchState: state?.deferredDispatchState || projected.deferredDispatchState,
  });

  return {
    ...state,
    stepRuntime,
    signals,
    activeStepIds,
    readyStepIds: signalSchedulingState.readyStepIds,
    blockedStepIds: signalSchedulingState.blockedStepIds,
    retryQueue: dedupe([...(state.retryQueue || []), ...retryQueue]).filter((stepId) => stepRuntime[stepId]?.status === 'retryable_error'),
    heldLocks,
    compat: {
      ...(state.compat || {}),
      activeDispatch,
      pendingManagers: projected.pendingManagers,
      pendingCapabilityHands: projected.pendingCapabilityHands,
      pendingProbes: projected.pendingProbes,
      nextExpectedActor,
      deferredDispatchState: state?.deferredDispatchState || projected.deferredDispatchState,
      childDispatchSessionIDs: state.childDispatchSessionIDs,
    },
    pendingManagers: projected.pendingManagers,
    pendingCapabilityHands: projected.pendingCapabilityHands,
    pendingProbes: projected.pendingProbes,
    nextExpectedActor,
    deferredDispatchState: state?.deferredDispatchState || projected.deferredDispatchState,
    activeDispatch,
  };
}

export function markStepInProgress(state, { stepId, sessionID = null, startedAt = nowIso() }) {
  if (!state?.graph?.steps?.[stepId]) return recoverGraphRuntimeState(state);
  const current = createDefaultStepRuntime(state.stepRuntime?.[stepId] || {});
  const nextState = {
    ...state,
    stepRuntime: {
      ...(state.stepRuntime || {}),
      [stepId]: {
        ...current,
        status: 'in_progress',
        attemptCount: Math.max(current.attemptCount || 0, 0) + 1,
        activeSessionID: sessionID,
        startedAt: current.startedAt || startedAt,
        lastProgressAt: startedAt,
        completedAt: null,
        completionSource: null,
        lastError: null,
      },
    },
  };
  return recoverGraphRuntimeState(nextState);
}

export function recordStepRetryableError(state, { stepId, message, at = nowIso() }) {
  if (!state?.graph?.steps?.[stepId]) return recoverGraphRuntimeState(state);
  const step = state.graph.steps[stepId];
  const current = createDefaultStepRuntime(state.stepRuntime?.[stepId] || {});
  const nextState = {
    ...state,
    activeDispatch: state.activeDispatch?.stepId === stepId ? null : state.activeDispatch,
    deferredDispatchState: 'retryable_error',
    lastDispatchError: {
      actor: step.actor,
      phase: step.kind,
      message: String(message || 'retryable error'),
      at,
    },
    stepRuntime: {
      ...(state.stepRuntime || {}),
      [stepId]: {
        ...current,
        status: 'retryable_error',
        activeSessionID: null,
        lastProgressAt: at,
        lastError: { message: String(message || 'retryable error'), at },
      },
    },
    retryQueue: dedupe([...(state.retryQueue || []), stepId]),
  };
  return recoverGraphRuntimeState(nextState);
}
