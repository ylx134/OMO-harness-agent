export const CURRENT_STATE_SCHEMA_VERSION = 2;

export const TERMINAL_STEP_STATUSES = new Set([
  'succeeded',
  'terminal_error',
  'skipped',
]);

type StepRuntimeShape = {
  status?: string;
  attemptCount?: number;
  activeSessionID?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  lastProgressAt?: string | null;
  completionSource?: string | null;
  lastError?: unknown;
};

export function createDefaultStepRuntime(overrides: StepRuntimeShape = {}) {
  return {
    status: 'pending',
    attemptCount: 0,
    activeSessionID: null,
    startedAt: null,
    completedAt: null,
    lastProgressAt: null,
    completionSource: null,
    lastError: null,
    ...overrides,
  };
}

export function normalizeStepRuntime(graph: { steps?: Record<string, unknown> } | undefined, stepRuntime: Record<string, StepRuntimeShape> = {}) {
  const normalized: Record<string, StepRuntimeShape> = {};
  for (const stepId of Object.keys(graph?.steps || {})) {
    normalized[stepId] = createDefaultStepRuntime(stepRuntime[stepId] || {});
  }
  return normalized;
}
