// @ts-nocheck
export const CURRENT_STATE_SCHEMA_VERSION = 2;

export const TERMINAL_STEP_STATUSES = new Set([
  'succeeded',
  'terminal_error',
  'skipped',
]);

export function createDefaultStepRuntime(overrides = {}) {
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

export function normalizeStepRuntime(graph, stepRuntime = {}) {
  const normalized = {};
  for (const stepId of Object.keys(graph?.steps || {})) {
    normalized[stepId] = createDefaultStepRuntime(stepRuntime[stepId] || {});
  }
  return normalized;
}
