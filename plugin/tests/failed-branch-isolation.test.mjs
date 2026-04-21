import test from 'node:test';
import assert from 'node:assert/strict';

import * as plugin from '../dist/index.js';

test('one failed branch does not corrupt unrelated branch runtime or compat queues', () => {
  const graph = {
    routeId: 'parallel-check',
    taskType: '验证型',
    flowTier: '中流程',
    steps: {
      'manager:execution-manager': {
        id: 'manager:execution-manager',
        actor: 'execution-manager',
        kind: 'manager',
        phase: 'execution',
        dependsOnStepIds: [],
        dependsOnSignals: [],
        emitsSignals: [],
        resourceLocks: [],
        completionPolicy: 'legacy-scalar-compat',
        retryPolicy: { maxAttempts: 1, backoffMs: 0 },
        allowedToolsPolicy: 'inherit-runtime',
        producesDeliverables: [],
      },
      'capability-hand:code-agent': {
        id: 'capability-hand:code-agent',
        actor: 'code-agent',
        kind: 'capability-hand',
        phase: 'execution',
        dependsOnStepIds: ['manager:execution-manager'],
        dependsOnSignals: [],
        emitsSignals: [],
        resourceLocks: [],
        completionPolicy: 'legacy-scalar-compat',
        retryPolicy: { maxAttempts: 2, backoffMs: 1000 },
        allowedToolsPolicy: 'inherit-runtime',
        producesDeliverables: [],
      },
      'capability-hand:docs-agent': {
        id: 'capability-hand:docs-agent',
        actor: 'docs-agent',
        kind: 'capability-hand',
        phase: 'execution',
        dependsOnStepIds: ['manager:execution-manager'],
        dependsOnSignals: [],
        emitsSignals: [],
        resourceLocks: [],
        completionPolicy: 'legacy-scalar-compat',
        retryPolicy: { maxAttempts: 2, backoffMs: 1000 },
        allowedToolsPolicy: 'inherit-runtime',
        producesDeliverables: [],
      },
      'manager:acceptance-manager': {
        id: 'manager:acceptance-manager',
        actor: 'acceptance-manager',
        kind: 'manager',
        phase: 'acceptance',
        dependsOnStepIds: ['capability-hand:code-agent', 'capability-hand:docs-agent'],
        dependsOnSignals: [],
        emitsSignals: [],
        resourceLocks: [],
        completionPolicy: 'legacy-scalar-compat',
        retryPolicy: { maxAttempts: 1, backoffMs: 0 },
        allowedToolsPolicy: 'inherit-runtime',
        producesDeliverables: [],
      },
    },
  };

  const state = plugin.recoverGraphRuntimeState({
    schemaVersion: 2,
    routeId: 'parallel-check',
    taskType: '验证型',
    flowTier: '中流程',
    graph,
    stepRuntime: {
      'manager:execution-manager': {
        status: 'succeeded',
        attemptCount: 1,
        activeSessionID: null,
        startedAt: '2026-04-21T00:00:00.000Z',
        completedAt: '2026-04-21T00:01:00.000Z',
        lastProgressAt: '2026-04-21T00:01:00.000Z',
        completionSource: 'session-store',
        lastError: null,
      },
      'capability-hand:code-agent': {
        status: 'in_progress',
        attemptCount: 1,
        activeSessionID: 'child_code',
        startedAt: '2026-04-21T00:02:00.000Z',
        completedAt: null,
        lastProgressAt: '2026-04-21T00:02:00.000Z',
        completionSource: null,
        lastError: null,
      },
      'capability-hand:docs-agent': {
        status: 'succeeded',
        attemptCount: 1,
        activeSessionID: null,
        startedAt: '2026-04-21T00:02:00.000Z',
        completedAt: '2026-04-21T00:03:00.000Z',
        lastProgressAt: '2026-04-21T00:03:00.000Z',
        completionSource: 'tool',
        lastError: null,
      },
    },
    activeDispatch: {
      actor: 'code-agent',
      phase: 'capability-hand',
      stepId: 'capability-hand:code-agent',
      sessionID: 'child_code',
      startedAt: '2026-04-21T00:02:00.000Z',
    },
    retryQueue: [],
    currentPhase: 'execution',
    nextExpectedActor: 'code-agent',
    childDispatchSessionIDs: {
      planning: [],
      execution: ['child_exec'],
      acceptance: [],
      capabilityHands: { 'code-agent': 'child_code', 'docs-agent': 'child_docs' },
      probes: {},
      acceptanceClosure: [],
    },
  });

  const failed = plugin.recordStepRetryableError(state, {
    stepId: 'capability-hand:code-agent',
    message: 'tool failure',
    at: '2026-04-21T00:04:00.000Z',
  });

  assert.equal(failed.stepRuntime['capability-hand:code-agent'].status, 'retryable_error');
  assert.equal(failed.stepRuntime['capability-hand:docs-agent'].status, 'succeeded');
  assert.deepEqual(failed.retryQueue, ['capability-hand:code-agent']);
  assert.deepEqual(failed.pendingCapabilityHands, ['code-agent']);
  assert.equal(failed.nextExpectedActor, 'code-agent');
  assert.equal(failed.compat.pendingCapabilityHands.includes('docs-agent'), false);
  assert.equal(failed.activeDispatch, null);
});
