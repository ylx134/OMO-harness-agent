import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeContinuationPolicy, continuationDecision } from '../dist/index.js';

function emptyState(overrides = {}) {
  return {
    currentPhase: 'planning',
    nextExpectedActor: 'planning-manager',
    pendingManagers: ['planning-manager'],
    pendingCapabilityHands: ['code-agent', 'shell-agent'],
    pendingProbes: ['artifact-probe-agent'],
    activeStepIds: [],
    readyStepIds: [],
    activeDispatch: null,
    graph: { steps: {} },
    stepRuntime: {},
    retryQueue: [],
    blockers: [],
    rawUserInput: 'fix the build',
    ...overrides,
  };
}

function idleState(overrides = {}) {
  return {
    ...emptyState(),
    pendingManagers: [],
    pendingCapabilityHands: [],
    pendingProbes: [],
    activeStepIds: [],
    readyStepIds: [],
    activeDispatch: null,
    retryQueue: [],
    ...overrides,
  };
}

// ═══ normalizeContinuationPolicy ═══

test('normalizeContinuationPolicy detects "auto" keyword → mode auto', () => {
  const policy = normalizeContinuationPolicy('auto fix the build error');
  assert.equal(policy.mode, 'auto');
  assert.equal(policy.maxIterations, 50);
  assert.equal(policy.continueOnError, true);
  assert.equal(policy.autoApproveNonBlocking, true);
  assert.ok(policy.detectedKeywords.length > 0);
});

test('normalizeContinuationPolicy detects Chinese "不要停" → mode auto', () => {
  const policy = normalizeContinuationPolicy('不要停，继续修复');
  assert.equal(policy.mode, 'auto');
  assert.equal(policy.maxIterations, 50);
  assert.ok(policy.detectedKeywords.some((k) => k === '不要停'));
});

test('normalizeContinuationPolicy detects Chinese "持续推进" → mode auto', () => {
  const policy = normalizeContinuationPolicy('持续推进任务');
  assert.equal(policy.mode, 'auto');
  assert.ok(policy.detectedKeywords.some((k) => k === '持续推进'));
});

test('normalizeContinuationPolicy detects "keep going" → mode auto', () => {
  const policy = normalizeContinuationPolicy('keep going until all tests pass');
  assert.equal(policy.mode, 'auto');
  assert.ok(policy.detectedKeywords.some((k) => /keep going/i.test(k)));
});

test('normalizeContinuationPolicy detects "continue until" → mode auto', () => {
  const policy = normalizeContinuationPolicy('continue until the build succeeds');
  assert.equal(policy.mode, 'auto');
  assert.ok(policy.detectedKeywords.some((k) => /continue until/i.test(k)));
});

test('normalizeContinuationPolicy detects "autopilot" → mode auto', () => {
  const policy = normalizeContinuationPolicy('run this in autopilot mode');
  assert.equal(policy.mode, 'auto');
});

test('normalizeContinuationPolicy detects "全自动" → mode auto', () => {
  const policy = normalizeContinuationPolicy('全自动执行');
  assert.equal(policy.mode, 'auto');
});

test('normalizeContinuationPolicy default mode is manual', () => {
  const policy = normalizeContinuationPolicy('fix the build error');
  assert.equal(policy.mode, 'manual');
  assert.equal(policy.maxIterations, 5);
  assert.equal(policy.continueOnError, false);
  assert.equal(policy.autoApproveNonBlocking, false);
  assert.deepEqual(policy.detectedKeywords, []);
});

test('normalizeContinuationPolicy handles empty message', () => {
  const policy = normalizeContinuationPolicy('');
  assert.equal(policy.mode, 'manual');
  assert.equal(policy.maxIterations, 5);
});

test('normalizeContinuationPolicy handles null/undefined gracefully', () => {
  const policy = normalizeContinuationPolicy(null);
  assert.equal(policy.mode, 'manual');
  assert.equal(policy.maxIterations, 5);
  assert.deepEqual(policy.detectedKeywords, []);
});

test('normalizeContinuationPolicy dedupes detected keywords', () => {
  const policy = normalizeContinuationPolicy('auto auto auto');
  assert.equal(policy.mode, 'auto');
  const autoKeywords = policy.detectedKeywords.filter((k) =>
    /^auto$/i.test(k),
  );
  assert.equal(autoKeywords.length, 1);
});

test('normalizeContinuationPolicy semi-auto keywords yield semi-auto mode', () => {
  const policy = normalizeContinuationPolicy('run this semi-auto step by step');
  assert.equal(policy.mode, 'semi-auto');
  assert.equal(policy.maxIterations, 20);
  assert.equal(policy.continueOnError, false);
  assert.equal(policy.autoApproveNonBlocking, true);
});

// ═══ continuationDecision ═══

test('continuationDecision returns finish when route is complete', () => {
  const state = idleState({
    currentPhase: 'complete',
  });

  assert.equal(continuationDecision(state), 'finish');
});

test('continuationDecision returns finish when no pending work and no active steps', () => {
  const state = idleState();

  assert.equal(continuationDecision(state), 'finish');
});

test('continuationDecision returns dispatch when managers are pending', () => {
  const state = emptyState({
    pendingManagers: ['planning-manager'],
    pendingCapabilityHands: [],
    pendingProbes: [],
  });

  assert.equal(continuationDecision(state), 'dispatch');
});

test('continuationDecision returns dispatch when capability hands are pending', () => {
  const state = emptyState({
    pendingManagers: [],
    pendingCapabilityHands: ['code-agent'],
    pendingProbes: [],
  });

  assert.equal(continuationDecision(state), 'dispatch');
});

test('continuationDecision returns dispatch when probes are pending', () => {
  const state = emptyState({
    pendingManagers: [],
    pendingCapabilityHands: [],
    pendingProbes: ['artifact-probe-agent'],
  });

  assert.equal(continuationDecision(state), 'dispatch');
});

test('continuationDecision returns dispatch when ready steps exist', () => {
  const state = idleState({
    readyStepIds: ['capability-hand:code-agent'],
  });

  assert.equal(continuationDecision(state), 'dispatch');
});

test('continuationDecision returns dispatch when active dispatch exists', () => {
  const state = idleState({
    activeDispatch: { actor: 'code-agent' },
  });

  assert.equal(continuationDecision(state), 'dispatch');
});

test('continuationDecision returns ask_user when ambiguity detected in rawUserInput', () => {
  const state = emptyState({
    rawUserInput: 'maybe fix something in the auth module',
  });

  assert.equal(continuationDecision(state), 'ask_user');
});

test('continuationDecision returns ask_user when Chinese ambiguity detected', () => {
  const state = emptyState({
    rawUserInput: '大概修复一下那个问题',
  });

  assert.equal(continuationDecision(state), 'ask_user');
});

test('continuationDecision returns ask_user when credential issue in rawUserInput', () => {
  const state = emptyState({
    rawUserInput: 'configure the api key for deployment',
  });

  assert.equal(continuationDecision(state), 'ask_user');
});

test('continuationDecision returns ask_user when password mentioned', () => {
  const state = emptyState({
    rawUserInput: 'reset the admin password',
  });

  assert.equal(continuationDecision(state), 'ask_user');
});

test('continuationDecision returns ask_user when blocker includes ambiguous language', () => {
  const state = emptyState({
    blockers: ['unsure about the scope maybe'],
  });

  assert.equal(continuationDecision(state), 'ask_user');
});

test('continuationDecision returns ask_user when blocker includes credential concern', () => {
  const state = emptyState({
    blockers: ['need api key to proceed'],
  });

  assert.equal(continuationDecision(state), 'ask_user');
});

test('continuationDecision returns retry when retryQueue has items', () => {
  const state = idleState({
    retryQueue: ['capability-hand:code-agent'],
  });

  assert.equal(continuationDecision(state), 'retry');
});

test('continuationDecision returns retry when stepRuntime has errors', () => {
  const state = idleState({
    stepRuntime: {
      'capability-hand:code-agent': {
        status: 'error',
        lastError: new Error('build failed'),
      },
    },
  });

  assert.equal(continuationDecision(state), 'retry');
});

test('continuationDecision returns retry when terminal_error exists', () => {
  const state = idleState({
    stepRuntime: {
      'capability-hand:shell-agent': {
        status: 'terminal_error',
        lastError: 'irrecoverable failure',
      },
    },
  });

  assert.equal(continuationDecision(state), 'retry');
});

test('continuationDecision defaults to finish for idle state with no pending work', () => {
  const state = idleState({
    activeStepIds: [],
    readyStepIds: [],
    activeDispatch: null,
  });

  assert.equal(continuationDecision(state), 'finish');
});

test('continuationDecision handles empty state gracefully', () => {
  assert.equal(continuationDecision({}), 'finish');
});

test('continuationDecision dispatch takes priority over retry', () => {
  const state = emptyState({
    pendingManagers: ['planning-manager'],
    pendingCapabilityHands: [],
    pendingProbes: [],
    retryQueue: ['capability-hand:code-agent'],
    stepRuntime: {
      'capability-hand:code-agent': { status: 'error', lastError: 'fail' },
    },
  });

  assert.equal(continuationDecision(state), 'dispatch');
});

test('continuationDecision ask_user takes priority over dispatch', () => {
  const state = emptyState({
    rawUserInput: 'maybe fix the auth with api key',
  });

  assert.equal(continuationDecision(state), 'ask_user');
});

test('continuationDecision retry takes priority when errors but no work to dispatch', () => {
  const state = idleState({
    retryQueue: ['capability-hand:code-agent'],
    stepRuntime: {
      'capability-hand:code-agent': { status: 'error', lastError: 'fail' },
    },
  });

  assert.equal(continuationDecision(state), 'retry');
});

test('auto mode: full policy configuration', () => {
  const policy = normalizeContinuationPolicy(
    'auto -- 持续推进直到所有测试通过，不要停',
  );

  assert.equal(policy.mode, 'auto');
  assert.equal(policy.maxIterations, 50);
  assert.equal(policy.continueOnError, true);
  assert.equal(policy.autoApproveNonBlocking, true);

  const state = emptyState();
  assert.equal(continuationDecision(state), 'dispatch');
});
