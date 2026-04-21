// @ts-nocheck
const LIVE_STEP_STATUSES = new Set(['dispatching', 'in_progress', 'waiting']);
function phaseFromStepId(stepId = '') {
    return String(stepId).split(':')[0] || '';
}
function actorFromStepId(stepId = '') {
    return String(stepId).split(':').slice(1).join(':');
}
function normalizeLiveStep(state, stepId, runtime) {
    if (!runtime?.activeSessionID)
        return null;
    if (!LIVE_STEP_STATUSES.has(runtime.status))
        return null;
    if (Array.isArray(state?.activeStepIds) && state.activeStepIds.length > 0 && !state.activeStepIds.includes(stepId)) {
        return null;
    }
    const graphStep = state?.graph?.steps?.[stepId] || {};
    const phase = graphStep.kind === 'acceptance-closure'
        ? 'acceptance-closure'
        : graphStep.kind || phaseFromStepId(stepId);
    return {
        stepId,
        actor: graphStep.actor || actorFromStepId(stepId),
        phase,
        status: runtime.status,
        sessionID: runtime.activeSessionID,
    };
}
export function listLiveDeferredSteps(state) {
    return Object.entries(state?.stepRuntime || {})
        .map(([stepId, runtime]) => normalizeLiveStep(state, stepId, runtime))
        .filter(Boolean);
}
export function authorizeDeferredChildActor(state, { agent = '', sessionID = '' } = {}) {
    const liveSteps = listLiveDeferredSteps(state);
    if (liveSteps.length === 0) {
        return { authorized: false, reason: 'no-live-step-match' };
    }
    const matches = liveSteps.filter((step) => {
        if (sessionID && step.sessionID !== sessionID)
            return false;
        if (agent && step.actor !== agent)
            return false;
        return true;
    });
    if (matches.length !== 1) {
        return { authorized: false, reason: 'no-live-step-match' };
    }
    return {
        authorized: true,
        reason: 'live-step-match',
        ...matches[0],
    };
}
export function actorForAuthorizedSession(state, sessionID = '') {
    const authorization = authorizeDeferredChildActor(state, { sessionID });
    return authorization.authorized ? authorization.actor : '';
}
