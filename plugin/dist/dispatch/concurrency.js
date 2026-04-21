// @ts-nocheck
const LIVE_STEP_STATUSES = new Set(['dispatching', 'in_progress', 'waiting']);
export function boundedDispatchBudgets() {
    return {
        managers: 1,
        hands: 2,
        probes: 2,
    };
}
export function resourceLocksForStep(step = {}) {
    if (step.kind !== 'capability-hand')
        return [];
    if (step.actor === 'shell-agent')
        return ['workspace-write', 'build-runner'];
    if (step.actor === 'code-agent')
        return ['workspace-write'];
    if (step.actor === 'docs-agent')
        return ['docs-write'];
    if (step.actor === 'evidence-agent')
        return ['evidence-write'];
    return [];
}
export function isLiveStepRuntime(runtime = {}) {
    return LIVE_STEP_STATUSES.has(runtime.status);
}
export function listLiveStepIds(state) {
    return Object.entries(state?.stepRuntime || {})
        .filter(([, runtime]) => isLiveStepRuntime(runtime))
        .map(([stepId]) => stepId);
}
export function deriveHeldLocks(graph, stepRuntime = {}) {
    const heldLocks = {};
    for (const [stepId, runtime] of Object.entries(stepRuntime || {})) {
        if (!isLiveStepRuntime(runtime))
            continue;
        for (const lockName of graph?.steps?.[stepId]?.resourceLocks || []) {
            if (!heldLocks[lockName])
                heldLocks[lockName] = stepId;
        }
    }
    return heldLocks;
}
export function activeStepsForState(state) {
    return (state?.activeStepIds || listLiveStepIds(state))
        .map((stepId) => ({ stepId, ...(state?.graph?.steps?.[stepId] || {}) }))
        .filter((step) => step.stepId && step.kind);
}
export function hasExclusiveLiveStep(state) {
    return activeStepsForState(state).some((step) => step.kind !== 'capability-hand');
}
export function selectRunnableCapabilityHandSteps(state, options = {}) {
    const readyStepIds = new Set(state?.readyStepIds || []);
    const heldLocks = { ...(state?.heldLocks || {}), ...(options.heldLocks || {}) };
    const activeHands = activeStepsForState(state).filter((step) => step.kind === 'capability-hand');
    const availableSlots = Math.max(0, Number(options.budget ?? boundedDispatchBudgets().hands) - activeHands.length);
    if (availableSlots <= 0)
        return [];
    if (hasExclusiveLiveStep(state))
        return [];
    const selected = [];
    const plannedLocks = { ...heldLocks };
    for (const actor of state?.pendingCapabilityHands || []) {
        const stepId = Object.entries(state?.graph?.steps || {}).find(([, step]) => step.actor === actor && step.kind === 'capability-hand')?.[0];
        if (!stepId || !readyStepIds.has(stepId))
            continue;
        if ((state?.activeStepIds || []).includes(stepId))
            continue;
        const locks = state?.graph?.steps?.[stepId]?.resourceLocks || [];
        const conflicts = locks.some((lockName) => plannedLocks[lockName] && plannedLocks[lockName] !== stepId);
        if (conflicts)
            continue;
        selected.push({ stepId, actor, kind: 'capability-hand', reason: 'pending_capability_hand' });
        for (const lockName of locks)
            plannedLocks[lockName] = stepId;
        if (selected.length >= availableSlots)
            break;
    }
    return selected;
}
export function selectRunnableProbeSteps(state, options = {}) {
    const readyStepIds = new Set(state?.readyStepIds || []);
    const activeSteps = activeStepsForState(state);
    const activeProbes = activeSteps.filter((step) => step.kind === 'probe');
    const availableSlots = Math.max(0, Number(options.budget ?? boundedDispatchBudgets().probes) - activeProbes.length);
    if (availableSlots <= 0)
        return [];
    if (activeSteps.some((step) => step.kind !== 'probe'))
        return [];
    const selected = [];
    for (const actor of state?.pendingProbes || []) {
        const stepId = Object.entries(state?.graph?.steps || {}).find(([, step]) => step.actor === actor && step.kind === 'probe')?.[0];
        if (!stepId || !readyStepIds.has(stepId))
            continue;
        if ((state?.activeStepIds || []).includes(stepId))
            continue;
        selected.push({ stepId, actor, kind: 'probe', reason: 'pending_probe' });
        if (selected.length >= availableSlots)
            break;
    }
    return selected;
}
