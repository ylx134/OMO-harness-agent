import assert from 'node:assert/strict';
import test from 'node:test';

import * as plugin from '../dist/index.js';

function createSignalGraph() {
  return {
    routeId: 'signal-route',
    taskType: '测试型',
    flowTier: '中流程',
    steps: {
      'capability-hand:a-prep': {
        id: 'capability-hand:a-prep',
        actor: 'docs-agent',
        kind: 'capability-hand',
        phase: 'execution',
        dependsOnStepIds: [],
        dependsOnSignals: [],
        emitsSignals: ['data-ready'],
        resourceLocks: [],
        completionPolicy: 'legacy-scalar-compat',
        retryPolicy: { maxAttempts: 1, backoffMs: 0 },
        allowedToolsPolicy: 'inherit-runtime',
        producesDeliverables: [],
      },
      'capability-hand:b-finish': {
        id: 'capability-hand:b-finish',
        actor: 'code-agent',
        kind: 'capability-hand',
        phase: 'execution',
        dependsOnStepIds: [],
        dependsOnSignals: ['data-ready'],
        emitsSignals: [],
        resourceLocks: [],
        completionPolicy: 'legacy-scalar-compat',
        retryPolicy: { maxAttempts: 1, backoffMs: 0 },
        allowedToolsPolicy: 'inherit-runtime',
        producesDeliverables: [],
      },
    },
  };
}

test('durable signals are persisted and unblock waiting steps during recovery', () => {
  const graph = createSignalGraph();
  const initial = plugin.recoverGraphRuntimeState({
    schemaVersion: 2,
    routeId: 'signal-route',
    taskType: '测试型',
    flowTier: '中流程',
    graph,
    signals: {},
    stepRuntime: {
      'capability-hand:a-prep': {
        status: 'in_progress',
        attemptCount: 1,
        activeSessionID: 'child_a',
        startedAt: '2026-04-21T00:00:00.000Z',
        completedAt: null,
        lastProgressAt: '2026-04-21T00:00:00.000Z',
        completionSource: null,
        lastError: null,
      },
      'capability-hand:b-finish': {
        status: 'pending',
        attemptCount: 0,
        activeSessionID: null,
        startedAt: null,
        completedAt: null,
        lastProgressAt: null,
        completionSource: null,
        lastError: null,
      },
    },
    activeDispatch: {
      actor: 'docs-agent',
      phase: 'capability-hand',
      stepId: 'capability-hand:a-prep',
      sessionID: 'child_a',
      startedAt: '2026-04-21T00:00:00.000Z',
    },
  });

  assert.deepEqual(initial.blockedStepIds, ['capability-hand:b-finish']);
  assert.deepEqual(initial.readyStepIds, []);
  assert.equal(initial.signals['data-ready']?.emitted, false);

  const completed = plugin.completeGraphStep(initial, {
    stepId: 'capability-hand:a-prep',
    source: 'session-store',
    completedAt: '2026-04-21T00:05:00.000Z',
  });

  assert.equal(completed.changed, true);
  assert.equal(completed.state.signals['data-ready']?.emitted, true);
  assert.equal(completed.state.signals['data-ready']?.emittedByStepId, 'capability-hand:a-prep');
  assert.deepEqual(completed.state.blockedStepIds, []);
  assert.deepEqual(completed.state.readyStepIds, ['capability-hand:b-finish']);
});
