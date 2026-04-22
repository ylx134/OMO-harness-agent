import type { GraphStateLike, GraphStep, StepRuntime } from '../types.js';

const LIVE_STEP_STATUSES = new Set(['dispatching', 'in_progress', 'waiting']);

type LiveDeferredStep = {
  stepId: string;
  actor: string;
  phase: string;
  status: string;
  sessionID: string;
};

function phaseFromStepId(stepId = '') {
  return String(stepId).split(':')[0] || '';
}

function actorFromStepId(stepId = '') {
  return String(stepId).split(':').slice(1).join(':');
}

function normalizeLiveStep(state: GraphStateLike, stepId: string, runtime: StepRuntime): LiveDeferredStep | null {
  if (!runtime?.activeSessionID) return null;
  if (!LIVE_STEP_STATUSES.has(runtime.status)) return null;
  if (Array.isArray(state?.activeStepIds) && state.activeStepIds.length > 0 && !state.activeStepIds.includes(stepId)) {
    return null;
  }

  const graphStep: Partial<GraphStep> = state?.graph?.steps?.[stepId] || {};
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

export function listLiveDeferredSteps(state: GraphStateLike): LiveDeferredStep[] {
  return Object.entries(state?.stepRuntime || {})
    .map(([stepId, runtime]) => normalizeLiveStep(state, stepId, runtime))
    .filter(Boolean);
}

export function authorizeDeferredChildActor(state: GraphStateLike, { agent = '', sessionID = '' } = {}) {
  const liveSteps = listLiveDeferredSteps(state);
  if (liveSteps.length === 0) {
    return { authorized: false, reason: 'no-live-step-match' };
  }

  const matches = liveSteps.filter((step) => {
    if (sessionID && step.sessionID !== sessionID) return false;
    if (agent && step.actor !== agent) return false;
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

export function actorForAuthorizedSession(state: GraphStateLike, sessionID = '') {
  const authorization = authorizeDeferredChildActor(state, { sessionID });
  return 'actor' in authorization ? authorization.actor : '';
}
