import test from 'node:test';
import assert from 'node:assert/strict';

import * as plugin from '../dist/index.js';

test('recovery reconstructs active dispatch and compat queues from graph runtime on restart', () => {
  const route = plugin.routeConfig('F-M1');
  const graph = plugin.compileRouteGraph({
    routeId: 'F-M1',
    route,
    selectedCapabilityHands: route.capability,
    selectedProbes: route.probes,
  });

  const recovered = plugin.recoverGraphRuntimeState({
    schemaVersion: 2,
    routeId: 'F-M1',
    taskType: route.taskType,
    flowTier: route.flowTier,
    graph,
    stepRuntime: {
      'manager:planning-manager': {
        status: 'succeeded',
        attemptCount: 1,
        activeSessionID: null,
        startedAt: '2026-04-21T00:00:00.000Z',
        completedAt: '2026-04-21T00:01:00.000Z',
        lastProgressAt: '2026-04-21T00:01:00.000Z',
        completionSource: 'session-store',
        lastError: null,
      },
      'manager:execution-manager': {
        status: 'in_progress',
        attemptCount: 1,
        activeSessionID: 'child_exec',
        startedAt: '2026-04-21T00:02:00.000Z',
        completedAt: null,
        lastProgressAt: '2026-04-21T00:02:00.000Z',
        completionSource: null,
        lastError: null,
      },
    },
    activeDispatch: null,
    retryQueue: [],
    childDispatchSessionIDs: {
      planning: ['child_plan'],
      execution: ['child_exec'],
      acceptance: [],
      capabilityHands: {},
      probes: {},
      acceptanceClosure: [],
    },
    currentPhase: 'execution',
    completedDeliverables: ['round-contract.md'],
  });

  assert.equal(recovered.activeDispatch?.actor, 'execution-manager');
  assert.equal(recovered.activeDispatch?.stepId, 'manager:execution-manager');
  assert.equal(recovered.activeDispatch?.sessionID, 'child_exec');
  assert.deepEqual(recovered.pendingManagers, ['execution-manager', 'acceptance-manager']);
  assert.equal(recovered.compat.activeDispatch?.actor, 'execution-manager');
  assert.deepEqual(recovered.activeStepIds, ['manager:execution-manager']);
});

test('retry recovery keeps retry queue unique and preserves existing serial next actor', () => {
  const route = plugin.routeConfig('F-M1');
  const graph = plugin.compileRouteGraph({
    routeId: 'F-M1',
    route,
    selectedCapabilityHands: route.capability,
    selectedProbes: route.probes,
  });
  const base = plugin.recoverGraphRuntimeState({
    schemaVersion: 2,
    routeId: 'F-M1',
    taskType: route.taskType,
    flowTier: route.flowTier,
    graph,
    stepRuntime: {
      'manager:planning-manager': {
        status: 'succeeded',
        attemptCount: 1,
        activeSessionID: null,
        startedAt: '2026-04-21T00:00:00.000Z',
        completedAt: '2026-04-21T00:01:00.000Z',
        lastProgressAt: '2026-04-21T00:01:00.000Z',
        completionSource: 'session-store',
        lastError: null,
      },
      'manager:execution-manager': {
        status: 'in_progress',
        attemptCount: 1,
        activeSessionID: 'child_exec',
        startedAt: '2026-04-21T00:02:00.000Z',
        completedAt: null,
        lastProgressAt: '2026-04-21T00:02:00.000Z',
        completionSource: null,
        lastError: null,
      },
    },
    retryQueue: ['manager:execution-manager', 'manager:execution-manager'],
    childDispatchSessionIDs: {
      planning: ['child_plan'],
      execution: ['child_exec'],
      acceptance: [],
      capabilityHands: {},
      probes: {},
      acceptanceClosure: [],
    },
  });

  const failed = plugin.recordStepRetryableError(base, {
    stepId: 'manager:execution-manager',
    message: 'session timeout',
    at: '2026-04-21T00:03:00.000Z',
  });

  assert.deepEqual(failed.retryQueue, ['manager:execution-manager']);
  assert.equal(failed.stepRuntime['manager:execution-manager'].status, 'retryable_error');
  assert.equal(failed.nextExpectedActor, 'execution-manager');
  assert.equal(failed.deferredDispatchState, 'retryable_error');
});

test('stepIdForActorPhase does not invent a manager acceptance step when only closure exists', () => {
  const state = {
    graph: {
      steps: {
        'acceptance-closure:acceptance-manager': {
          id: 'acceptance-closure:acceptance-manager',
          actor: 'acceptance-manager',
          kind: 'acceptance-closure',
          phase: 'acceptance',
          dependsOnStepIds: [],
          dependsOnSignals: [],
          emitsSignals: [],
          resourceLocks: [],
          completionPolicy: 'legacy-scalar-compat',
          retryPolicy: { maxAttempts: 1, backoffMs: 0 },
          allowedToolsPolicy: 'inherit-runtime',
          producesDeliverables: [],
        },
      },
    },
  };

  assert.equal(plugin.stepIdForActorPhase(state, 'acceptance-manager', 'manager'), null);
  assert.equal(
    plugin.stepIdForActorPhase(state, 'acceptance-manager', 'acceptance-closure'),
    'acceptance-closure:acceptance-manager',
  );
});
