export interface ContinuationPolicy {
  mode: 'auto' | 'semi-auto' | 'manual';
  maxIterations: number;
  continueOnError: boolean;
  autoApproveNonBlocking: boolean;
  detectedKeywords: string[];
}

interface ContinuationState {
  currentPhase?: string;
  nextExpectedActor?: string | null;
  pendingManagers?: string[];
  pendingCapabilityHands?: string[];
  pendingProbes?: string[];
  activeStepIds?: string[];
  readyStepIds?: string[];
  activeDispatch?: { actor?: string | null } | null;
  graph?: {
    steps?: Record<string, unknown>;
  };
  stepRuntime?: Record<
    string,
    {
      status?: string;
      lastError?: unknown;
      attemptCount?: number;
    }
  >;
  retryQueue?: string[];
  blockers?: string[];
  rawUserInput?: string;
}

const AUTO_KEYWORDS = [
  /不要停/,
  /持续推进/,
  /keep going/i,
  /continue until/i,
  /自动驾驶/,
  /自动完成/,
  /fully auto/i,
  /autopilot/i,
  /全自动/,
  /don't stop/i,
  /do not stop/i,
  /go ahead/i,
  /proceed automatically/i,
  /\bauto\b/i,
];

const SEMI_AUTO_KEYWORDS = [
  /semi.?auto/i,
  /step by step/i,
  /逐?步/,
  /one at a time/i,
  /逐个/,
];

function detectKeywords(message: string): string[] {
  const detected: string[] = [];
  const allPatterns = [...AUTO_KEYWORDS, ...SEMI_AUTO_KEYWORDS];
  const safe = String(message || '');
  for (const pattern of allPatterns) {
    const match = safe.match(pattern);
    if (match) {
      detected.push(match[0]);
    }
  }
  return [...new Set(detected)];
}

export function normalizeContinuationPolicy(
  message: string,
): ContinuationPolicy {
  const msg = String(message || '').toLowerCase();
  const detectedKeywords = detectKeywords(message);

  const isSemiAuto = SEMI_AUTO_KEYWORDS.some((p) => p.test(msg));
  const isAuto = !isSemiAuto && AUTO_KEYWORDS.some((p) => p.test(msg));

  let mode: 'auto' | 'semi-auto' | 'manual' = 'manual';
  if (isSemiAuto) {
    mode = 'semi-auto';
  } else if (isAuto) {
    mode = 'auto';
  }

  const maxIterations = mode === 'auto' ? 50 : mode === 'semi-auto' ? 20 : 5;

  return {
    mode,
    maxIterations,
    continueOnError: mode === 'auto',
    autoApproveNonBlocking: mode === 'auto' || mode === 'semi-auto',
    detectedKeywords,
  };
}

function isRouteComplete(state: ContinuationState): boolean {
  if (state.currentPhase === 'complete') return true;

  const hasPendingWork =
    (state.pendingManagers && state.pendingManagers.length > 0) ||
    (state.pendingCapabilityHands && state.pendingCapabilityHands.length > 0) ||
    (state.pendingProbes && state.pendingProbes.length > 0) ||
    (state.activeStepIds && state.activeStepIds.length > 0) ||
    (state.readyStepIds && state.readyStepIds.length > 0) ||
    (state.retryQueue && state.retryQueue.length > 0) ||
    (state.activeDispatch !== null && state.activeDispatch !== undefined) ||
    hasRetryableErrors(state);

  return !hasPendingWork;
}

function hasBlockingIssue(state: ContinuationState): boolean {
  const userInput = (state.rawUserInput || '').toLowerCase();

  const ambiguityPatterns = [
    /maybe/i, /大概/, /possibly/i, /不确定/, /perhaps/i, /或许/,
  ];

  const credentialPatterns = [
    /api[_\s]?key/i, /credential/i, /password/i, /密钥/, /secret/i, /token/i,
  ];

  const hasAmbiguity =
    state.blockers?.some((b) =>
      ambiguityPatterns.some((p) => p.test(b)),
    ) ||
    ambiguityPatterns.some((p) => p.test(userInput));

  const hasCredentialIssue =
    state.blockers?.some((b) =>
      credentialPatterns.some((p) => p.test(b)),
    ) ||
    credentialPatterns.some((p) => p.test(userInput));

  return hasAmbiguity || hasCredentialIssue;
}

function canDispatchMore(state: ContinuationState): boolean {
  const pendingManagers = state.pendingManagers?.length ?? 0;
  const pendingHands = state.pendingCapabilityHands?.length ?? 0;
  const pendingProbes = state.pendingProbes?.length ?? 0;
  const readySteps = state.readyStepIds?.length ?? 0;
  const activeSteps = state.activeStepIds?.length ?? 0;

  return (
    pendingManagers > 0 ||
    pendingHands > 0 ||
    pendingProbes > 0 ||
    readySteps > 0 ||
    activeSteps > 0 ||
    (state.activeDispatch !== null && state.activeDispatch !== undefined)
  );
}

function hasRetryableErrors(state: ContinuationState): boolean {
  if (state.retryQueue && state.retryQueue.length > 0) return true;

  if (state.stepRuntime) {
    for (const runtime of Object.values(state.stepRuntime)) {
      if (
        runtime.status === 'error' ||
        runtime.status === 'terminal_error' ||
        runtime.lastError
      ) {
        return true;
      }
    }
  }

  return false;
}

export function continuationDecision(
  state: ContinuationState,
): 'finish' | 'ask_user' | 'dispatch' | 'retry' {
  if (isRouteComplete(state)) {
    return 'finish';
  }

  if (hasBlockingIssue(state)) {
    return 'ask_user';
  }

  if (canDispatchMore(state)) {
    return 'dispatch';
  }

  if (hasRetryableErrors(state)) {
    return 'retry';
  }

  return 'retry';
}
