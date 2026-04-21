// @ts-nocheck
import { compileRouteGraph } from '../routing/graph.js';
import { resolveGraphRuntimeRollout } from '../mode/index.js';
import { projectLegacyState } from './legacy-projection.js';
import { CURRENT_STATE_SCHEMA_VERSION, createDefaultStepRuntime, normalizeStepRuntime, } from './schema.js';
function childDispatchDefaults(existing = {}) {
    return {
        planning: existing.planning || [],
        execution: existing.execution || [],
        acceptance: existing.acceptance || [],
        capabilityHands: existing.capabilityHands || {},
        probes: existing.probes || {},
        acceptanceClosure: existing.acceptanceClosure || [],
    };
}
function graphFromState(state) {
    if (state?.graph?.steps && Object.keys(state.graph.steps).length > 0) {
        return state.graph;
    }
    return compileRouteGraph({
        routeId: state?.routeId || 'J-L1',
        managers: state?.requiredManagers || [],
        selectedCapabilityHands: state?.selectedCapabilityHands || state?.requiredCapabilityHands || [],
        selectedProbes: state?.selectedProbes || state?.requiredProbes || [],
        taskType: state?.taskType || null,
        flowTier: state?.flowTier || null,
    });
}
function succeededByLegacyQueue(state, step) {
    if (step.kind === 'manager') {
        return !(state?.pendingManagers || []).includes(step.actor);
    }
    if (step.kind === 'capability-hand') {
        return !(state?.pendingCapabilityHands || []).includes(step.actor);
    }
    if (step.kind === 'probe') {
        return !(state?.pendingProbes || []).includes(step.actor);
    }
    return state?.currentPhase === 'complete' || state?.deferredDispatchState === 'complete';
}
function inProgressByLegacyDispatch(state, stepId, step) {
    if (!state?.activeDispatch)
        return false;
    if (state.activeDispatch.stepId && state.activeDispatch.stepId === stepId)
        return true;
    if (state.activeDispatch.phase) {
        const expectedPhase = step.kind === 'capability-hand'
            ? 'capability-hand'
            : step.kind === 'probe'
                ? 'probe'
                : step.kind === 'acceptance-closure'
                    ? 'acceptance-closure'
                    : 'manager';
        return state.activeDispatch.actor === step.actor && state.activeDispatch.phase === expectedPhase;
    }
    return state.activeDispatch.actor === step.actor;
}
function synchronizeStepRuntimeWithLegacy(state, graph) {
    const stepRuntime = normalizeStepRuntime(graph, state?.stepRuntime || {});
    const hasAuthoritativeGraphRuntime = Number(state?.schemaVersion || 0) >= CURRENT_STATE_SCHEMA_VERSION && Object.keys(state?.stepRuntime || {}).length > 0;
    for (const [stepId, step] of Object.entries(graph.steps || {})) {
        const existing = stepRuntime[stepId] || createDefaultStepRuntime();
        if (hasAuthoritativeGraphRuntime) {
            if (inProgressByLegacyDispatch(state, stepId, step) && existing.status === 'pending') {
                stepRuntime[stepId] = createDefaultStepRuntime({
                    ...existing,
                    status: 'in_progress',
                    attemptCount: Math.max(existing.attemptCount || 0, 1),
                    activeSessionID: state?.activeDispatch?.sessionID || existing.activeSessionID || null,
                    startedAt: state?.activeDispatch?.startedAt || existing.startedAt || null,
                    lastProgressAt: existing.lastProgressAt || state?.updatedAt || null,
                });
            }
            else {
                stepRuntime[stepId] = createDefaultStepRuntime(existing);
            }
            continue;
        }
        if (inProgressByLegacyDispatch(state, stepId, step)) {
            stepRuntime[stepId] = createDefaultStepRuntime({
                ...existing,
                status: 'in_progress',
                attemptCount: Math.max(existing.attemptCount || 0, 1),
                activeSessionID: state?.activeDispatch?.sessionID || existing.activeSessionID || null,
                startedAt: state?.activeDispatch?.startedAt || existing.startedAt || null,
                lastProgressAt: existing.lastProgressAt || state?.updatedAt || null,
            });
            continue;
        }
        if (succeededByLegacyQueue(state, step)) {
            stepRuntime[stepId] = createDefaultStepRuntime({
                ...existing,
                status: 'succeeded',
                completedAt: existing.completedAt || state?.updatedAt || null,
            });
            continue;
        }
        stepRuntime[stepId] = createDefaultStepRuntime({
            ...existing,
            status: existing.status === 'succeeded' ? 'succeeded' : 'pending',
            activeSessionID: null,
        });
    }
    return stepRuntime;
}
export function ensureGraphState(state) {
    if (!state)
        return null;
    const graph = graphFromState(state);
    const stepRuntime = synchronizeStepRuntimeWithLegacy(state, graph);
    const childDispatchSessionIDs = childDispatchDefaults(state.childDispatchSessionIDs);
    const graphRuntimeRollout = resolveGraphRuntimeRollout(state);
    const projected = projectLegacyState({
        ...state,
        graph,
        stepRuntime,
        childDispatchSessionIDs,
        graphRuntimeRollout,
    });
    const compat = {
        activeDispatch: projected.activeDispatch,
        pendingManagers: projected.pendingManagers,
        pendingCapabilityHands: projected.pendingCapabilityHands,
        pendingProbes: projected.pendingProbes,
        nextExpectedActor: projected.nextExpectedActor,
        deferredDispatchState: projected.deferredDispatchState,
        childDispatchSessionIDs,
    };
    const activeStepIds = Object.entries(stepRuntime)
        .filter(([, runtime]) => ['dispatching', 'in_progress', 'waiting'].includes(runtime.status))
        .map(([stepId]) => stepId);
    const { version, ...rest } = state;
    return {
        ...rest,
        schemaVersion: CURRENT_STATE_SCHEMA_VERSION,
        graph,
        stepRuntime,
        signals: state.signals || {},
        activeStepIds,
        readyStepIds: state.readyStepIds || [],
        blockedStepIds: state.blockedStepIds || [],
        retryQueue: state.retryQueue || [],
        heldLocks: state.heldLocks || {},
        graphRuntimeRollout,
        childDispatchSessionIDs,
        compat,
        pendingManagers: state.pendingManagers || projected.pendingManagers,
        pendingCapabilityHands: state.pendingCapabilityHands || projected.pendingCapabilityHands,
        pendingProbes: state.pendingProbes || projected.pendingProbes,
        nextExpectedActor: state.nextExpectedActor || projected.nextExpectedActor,
        deferredDispatchState: state.deferredDispatchState || projected.deferredDispatchState,
        activeDispatch: state.activeDispatch || projected.activeDispatch,
    };
}
export function migratePluginState(state) {
    return ensureGraphState(state);
}
