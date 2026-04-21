// @ts-nocheck
import { resourceLocksForStep } from '../dispatch/concurrency.js';
function phaseForManager(actor) {
    if (actor === 'execution-manager')
        return 'execution';
    if (actor === 'acceptance-manager')
        return 'acceptance';
    return 'planning';
}
function createStep(id, actor, kind, phase, dependsOnStepIds = []) {
    const step = {
        id,
        actor,
        kind,
        phase,
        dependsOnStepIds,
        dependsOnSignals: [],
        emitsSignals: [],
        resourceLocks: [],
        completionPolicy: 'legacy-scalar-compat',
        retryPolicy: { maxAttempts: 1, backoffMs: 0 },
        allowedToolsPolicy: 'inherit-runtime',
        producesDeliverables: [],
    };
    return {
        ...step,
        resourceLocks: resourceLocksForStep(step),
    };
}
export function compileRouteGraph({ routeId, route, managers, selectedCapabilityHands, selectedProbes, taskType, flowTier, }) {
    const managerActors = [...(managers || route?.managers || [])];
    const handActors = [...(selectedCapabilityHands || route?.capability || [])];
    const probeActors = [...(selectedProbes || route?.probes || [])];
    const preAcceptanceManagers = managerActors.filter((actor) => actor !== 'acceptance-manager');
    const acceptanceManagers = managerActors.filter((actor) => actor === 'acceptance-manager');
    const steps = {};
    let previousStepId = null;
    const handStepIds = [];
    for (const actor of preAcceptanceManagers) {
        const id = `manager:${actor}`;
        steps[id] = createStep(id, actor, 'manager', phaseForManager(actor), previousStepId ? [previousStepId] : []);
        previousStepId = id;
    }
    for (const actor of handActors) {
        const id = `capability-hand:${actor}`;
        steps[id] = createStep(id, actor, 'capability-hand', 'execution', previousStepId ? [previousStepId] : []);
        handStepIds.push(id);
    }
    for (const actor of acceptanceManagers) {
        const id = `manager:${actor}`;
        steps[id] = createStep(id, actor, 'manager', phaseForManager(actor), handStepIds.length > 0 ? handStepIds : (previousStepId ? [previousStepId] : []));
        previousStepId = id;
    }
    const probeDependencyStepIds = previousStepId ? [previousStepId] : [];
    const probeStepIds = [];
    for (const actor of probeActors) {
        const id = `probe:${actor}`;
        steps[id] = createStep(id, actor, 'probe', 'acceptance', probeDependencyStepIds);
        probeStepIds.push(id);
    }
    const closureId = 'acceptance-closure:acceptance-manager';
    steps[closureId] = createStep(closureId, 'acceptance-manager', 'acceptance-closure', 'acceptance', probeStepIds.length > 0 ? probeStepIds : probeDependencyStepIds);
    return {
        routeId,
        taskType: taskType || route?.taskType || null,
        flowTier: flowTier || route?.flowTier || null,
        steps,
    };
}
