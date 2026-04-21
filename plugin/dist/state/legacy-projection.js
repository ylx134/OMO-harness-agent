// @ts-nocheck
import { TERMINAL_STEP_STATUSES } from './schema.js';
function stepStatus(state, stepId) {
    return state?.stepRuntime?.[stepId]?.status || 'pending';
}
function isPendingLike(state, stepId) {
    return !TERMINAL_STEP_STATUSES.has(stepStatus(state, stepId));
}
function activeStepEntry(state) {
    const entries = Object.entries(state?.graph?.steps || {});
    return entries.find(([stepId]) => {
        const status = stepStatus(state, stepId);
        return ['dispatching', 'in_progress', 'waiting'].includes(status);
    }) || null;
}
function phaseForStepKind(kind) {
    if (kind === 'capability-hand')
        return 'capability-hand';
    if (kind === 'probe')
        return 'probe';
    if (kind === 'acceptance-closure')
        return 'acceptance-closure';
    return 'manager';
}
function deferredDispatchStateForStep(kind) {
    if (kind === 'capability-hand')
        return 'hand_in_progress';
    if (kind === 'probe')
        return 'probe_in_progress';
    if (kind === 'acceptance-closure')
        return 'acceptance_closure_in_progress';
    return 'manager_in_progress';
}
export function projectLegacyState(state) {
    const steps = Object.entries(state?.graph?.steps || {});
    const pendingManagers = steps
        .filter(([, step]) => step.kind === 'manager')
        .filter(([stepId]) => isPendingLike(state, stepId))
        .map(([, step]) => step.actor);
    const pendingCapabilityHands = steps
        .filter(([, step]) => step.kind === 'capability-hand')
        .filter(([stepId]) => isPendingLike(state, stepId))
        .map(([, step]) => step.actor);
    const pendingProbes = steps
        .filter(([, step]) => step.kind === 'probe')
        .filter(([stepId]) => isPendingLike(state, stepId))
        .map(([, step]) => step.actor);
    const activeEntry = activeStepEntry(state);
    const activeDispatch = activeEntry
        ? {
            actor: activeEntry[1].actor,
            phase: phaseForStepKind(activeEntry[1].kind),
            sessionID: state.stepRuntime[activeEntry[0]]?.activeSessionID || null,
            stepId: activeEntry[0],
            startedAt: state.stepRuntime[activeEntry[0]]?.startedAt || null,
        }
        : null;
    const deferredDispatchState = state?.deferredDispatchState
        || (activeEntry ? deferredDispatchStateForStep(activeEntry[1].kind) : (state?.currentPhase === 'complete' ? 'complete' : 'ready'));
    const nextExpectedActor = state?.nextExpectedActor
        || activeDispatch?.actor
        || pendingManagers[0]
        || pendingCapabilityHands[0]
        || pendingProbes[0]
        || (isPendingLike(state, 'acceptance-closure:acceptance-manager') ? 'acceptance-manager' : 'none');
    return {
        pendingManagers,
        pendingCapabilityHands,
        pendingProbes,
        nextExpectedActor,
        deferredDispatchState,
        activeDispatch,
        childDispatchSessionIDs: state?.childDispatchSessionIDs || null,
    };
}
