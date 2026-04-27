import { TERMINAL_STEP_STATUSES } from './schema.js';

import type { GraphStateLike, GraphStep, StepRuntime } from '../types.js';

function stepStatus(state: GraphStateLike, stepId: string) {
  return state?.stepRuntime?.[stepId]?.status || 'pending';
}

function isPendingLike(state: GraphStateLike, stepId: string) {
  return !TERMINAL_STEP_STATUSES.has(stepStatus(state, stepId));
}

function activeStepActor(state: GraphStateLike) {
  const explicitActor = state?.activeDispatch?.actor;
  if (explicitActor) return explicitActor;

  for (const stepId of state?.activeStepIds || []) {
    const step: GraphStep | undefined = state?.graph?.steps?.[stepId];
    if (step?.actor) return step.actor;
  }

  const entries = Object.entries(state?.graph?.steps || {}) as Array<[string, GraphStep]>;
  const liveEntry = entries.find(([stepId]) => ['dispatching', 'in_progress', 'waiting'].includes(stepStatus(state, stepId)));
  return liveEntry?.[1]?.actor || '';
}

type NextExpectedActorState = GraphStateLike & {
  blocked?: boolean;
  currentPhase?: string;
  deferredDispatchState?: string;
  pendingManagers?: string[];
  nextExpectedActor?: string;
  activeDispatch?: { actor?: string | null } | null;
  stepRuntime?: Record<string, StepRuntime>;
  compat?: { nextExpectedActor?: string } | null;
};

export function deriveNextExpectedActor(state: NextExpectedActorState = {}) {
  if (state?.currentPhase === 'complete' || state?.deferredDispatchState === 'complete') return 'none';

  if (state?.nextExpectedActor) return state.nextExpectedActor;
  if (state?.compat?.nextExpectedActor) return state.compat.nextExpectedActor;
  if (state?.blocked) return 'none';

  const activeActor = activeStepActor(state);
  if (activeActor) return activeActor;

  const pendingManagers = state?.pendingManagers || [];
  if (pendingManagers.length > 0 && pendingManagers[0] !== 'acceptance-manager') return pendingManagers[0];

  const pendingCapabilityHands = state?.pendingCapabilityHands || [];
  if (state?.currentPhase === 'execution' && pendingCapabilityHands.length > 0) return pendingCapabilityHands[0];

  if (pendingManagers.length > 0) return pendingManagers[0];

  if (pendingCapabilityHands.length > 0) return pendingCapabilityHands[0];

  const pendingProbes = state?.pendingProbes || [];
  if (state?.currentPhase === 'probe-verification' && pendingProbes.length > 0) return pendingProbes[0];
  if (pendingProbes.length > 0) return pendingProbes[0];

  if (isPendingLike(state, 'acceptance-closure:acceptance-manager')) return 'acceptance-manager';

  return 'none';
}
