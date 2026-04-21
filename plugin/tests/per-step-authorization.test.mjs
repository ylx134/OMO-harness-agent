import test from 'node:test';
import assert from 'node:assert/strict';

import * as plugin from '../dist/index.js';

function buildState(overrides = {}) {
  return {
    activeDispatch: {
      actor: 'planning-manager',
      phase: 'manager',
      sessionID: 'child_plan_stale',
      stepId: 'manager:planning-manager',
      startedAt: '2026-04-21T00:00:00.000Z',
    },
    activeAgent: 'harness-orchestrator',
    sessionID: 'parent_ses',
    childDispatchSessionIDs: {
      planning: ['child_plan_stale'],
      execution: ['child_exec_live'],
      acceptance: [],
      capabilityHands: {
        'code-agent': ['child_code_done'],
      },
      probes: {},
      acceptanceClosure: [],
    },
    stepRuntime: {
      'manager:planning-manager': {
        status: 'succeeded',
        attemptCount: 1,
        activeSessionID: null,
        startedAt: '2026-04-21T00:00:00.000Z',
        completedAt: '2026-04-21T00:05:00.000Z',
        lastProgressAt: '2026-04-21T00:05:00.000Z',
        completionSource: 'chat.message',
        lastError: null,
      },
      'manager:execution-manager': {
        status: 'in_progress',
        attemptCount: 1,
        activeSessionID: 'child_exec_live',
        startedAt: '2026-04-21T00:06:00.000Z',
        completedAt: null,
        lastProgressAt: '2026-04-21T00:06:00.000Z',
        completionSource: null,
        lastError: null,
      },
      'capability-hand:code-agent': {
        status: 'succeeded',
        attemptCount: 1,
        activeSessionID: null,
        startedAt: '2026-04-21T00:07:00.000Z',
        completedAt: '2026-04-21T00:08:00.000Z',
        lastProgressAt: '2026-04-21T00:08:00.000Z',
        completionSource: 'tool.execute.after',
        lastError: null,
      },
    },
    activeStepIds: ['manager:execution-manager'],
    ...overrides,
  };
}

test('authorizeDeferredChildActor accepts a live step session even when activeDispatch is stale', () => {
  const state = buildState();

  const authorization = plugin.authorizeDeferredChildActor(state, {
    agent: 'execution-manager',
    sessionID: 'child_exec_live',
  });

  assert.equal(authorization.authorized, true);
  assert.equal(authorization.stepId, 'manager:execution-manager');
  assert.equal(authorization.actor, 'execution-manager');
  assert.equal(authorization.phase, 'manager');
});

test('authorizeDeferredChildActor rejects stale or completed child sessions even if they remain recorded', () => {
  const state = buildState();

  const authorization = plugin.authorizeDeferredChildActor(state, {
    agent: 'code-agent',
    sessionID: 'child_code_done',
  });

  assert.equal(authorization.authorized, false);
  assert.equal(authorization.reason, 'no-live-step-match');
});

test('authorizeDeferredChildActor can resolve a live child actor by session id without an explicit agent', () => {
  const state = buildState();

  const authorization = plugin.authorizeDeferredChildActor(state, {
    sessionID: 'child_exec_live',
  });

  assert.equal(authorization.authorized, true);
  assert.equal(authorization.actor, 'execution-manager');
  assert.equal(authorization.stepId, 'manager:execution-manager');
});
