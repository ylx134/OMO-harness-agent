import type { GraphStateLike, GraphStep, RouteGraph, StepRuntime } from '../types.js';

const LIVE_STEP_STATUSES = new Set(['dispatching', 'in_progress', 'waiting']);

type LiveStep = GraphStep & { stepId: string };

type HeldLocks = Record<string, string>;

type SelectionOptions = {
  budget?: number;
  heldLocks?: HeldLocks;
};

export function boundedDispatchBudgets() {
  return {
    managers: 1,
    hands: 2,
    probes: 2,
  };
}

export function resourceLocksForStep(step: Partial<GraphStep> = {}) {
  if (step.kind !== 'capability-hand') return [];
  if (step.actor === 'shell-agent') return ['workspace-write', 'build-runner'];
  if (step.actor === 'code-agent') return ['workspace-write'];
  if (step.actor === 'docs-agent') return ['docs-write'];
  if (step.actor === 'evidence-agent') return ['evidence-write'];
  return [];
}

export function isLiveStepRuntime(runtime: Partial<StepRuntime> = {}) {
  return LIVE_STEP_STATUSES.has(runtime.status);
}

export function listLiveStepIds(state: GraphStateLike) {
  return Object.entries(state?.stepRuntime || {})
    .filter(([, runtime]) => isLiveStepRuntime(runtime))
    .map(([stepId]) => stepId);
}

export function deriveHeldLocks(graph: RouteGraph | undefined, stepRuntime: Record<string, StepRuntime> = {}) {
  const heldLocks: HeldLocks = {};
  for (const [stepId, runtime] of Object.entries(stepRuntime || {})) {
    if (!isLiveStepRuntime(runtime)) continue;
    for (const lockName of graph?.steps?.[stepId]?.resourceLocks || []) {
      if (!heldLocks[lockName]) heldLocks[lockName] = stepId;
    }
  }
  return heldLocks;
}

export function activeStepsForState(state: GraphStateLike): LiveStep[] {
  return (state?.activeStepIds || listLiveStepIds(state)).reduce<LiveStep[]>((steps, stepId) => {
    const graphStep = state?.graph?.steps?.[stepId];
    if (!graphStep) return steps;
    steps.push({ stepId, ...graphStep });
    return steps;
  }, []);
}

export function hasExclusiveLiveStep(state: GraphStateLike) {
  return activeStepsForState(state).some((step) => step.kind !== 'capability-hand');
}

export function selectRunnableCapabilityHandSteps(state: GraphStateLike, options: SelectionOptions = {}) {
  const readyStepIds = new Set(state?.readyStepIds || []);
  const heldLocks = { ...(state?.heldLocks || {}), ...(options.heldLocks || {}) };
  const activeHands = activeStepsForState(state).filter((step) => step.kind === 'capability-hand');
  const availableSlots = Math.max(0, Number(options.budget ?? boundedDispatchBudgets().hands) - activeHands.length);

  if (availableSlots <= 0) return [];
  if (hasExclusiveLiveStep(state)) return [];

  const selected: Array<{ stepId: string; actor: string; kind: 'capability-hand'; reason: string }> = [];
  const plannedLocks = { ...heldLocks };

  for (const actor of state?.pendingCapabilityHands || []) {
    const stepId = Object.entries(state?.graph?.steps || {}).find(([, step]) => step.actor === actor && step.kind === 'capability-hand')?.[0];
    if (!stepId || !readyStepIds.has(stepId)) continue;
    if ((state?.activeStepIds || []).includes(stepId)) continue;

    const locks = state?.graph?.steps?.[stepId]?.resourceLocks || [];
    const conflicts = locks.some((lockName) => plannedLocks[lockName] && plannedLocks[lockName] !== stepId);
    if (conflicts) continue;

    selected.push({ stepId, actor, kind: 'capability-hand', reason: 'pending_capability_hand' });
    for (const lockName of locks) plannedLocks[lockName] = stepId;
    if (selected.length >= availableSlots) break;
  }

  return selected;
}

export function selectRunnableProbeSteps(state: GraphStateLike, options: SelectionOptions = {}) {
  const readyStepIds = new Set(state?.readyStepIds || []);
  const activeSteps = activeStepsForState(state);
  const activeProbes = activeSteps.filter((step) => step.kind === 'probe');
  const availableSlots = Math.max(0, Number(options.budget ?? boundedDispatchBudgets().probes) - activeProbes.length);

  if (availableSlots <= 0) return [];
  if (activeSteps.some((step) => step.kind !== 'probe')) return [];

  const selected: Array<{ stepId: string; actor: string; kind: 'probe'; reason: string }> = [];

  for (const actor of state?.pendingProbes || []) {
    const stepId = Object.entries(state?.graph?.steps || {}).find(([, step]) => step.actor === actor && step.kind === 'probe')?.[0];
    if (!stepId || !readyStepIds.has(stepId)) continue;
    if ((state?.activeStepIds || []).includes(stepId)) continue;

    selected.push({ stepId, actor, kind: 'probe', reason: 'pending_probe' });
    if (selected.length >= availableSlots) break;
  }

  return selected;
}
