import test from 'node:test';
import assert from 'node:assert/strict';

import * as plugin from '../dist/index.js';

test('ensureGraphState prefers graph-derived pending managers over stale legacy queue fields', () => {
  const route = plugin.routeConfig('F-M1');
  const graph = plugin.compileRouteGraph({
    routeId: 'F-M1',
    route,
    selectedCapabilityHands: route.capability,
    selectedProbes: route.probes,
  });

  const state = plugin.ensureGraphState({
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
        startedAt: '2026-04-22T00:00:00.000Z',
        completedAt: '2026-04-22T00:01:00.000Z',
        lastProgressAt: '2026-04-22T00:01:00.000Z',
        completionSource: 'session-store',
        lastError: null,
      },
    },
    pendingManagers: ['planning-manager', 'execution-manager', 'acceptance-manager'],
    pendingCapabilityHands: route.capability,
    pendingProbes: route.probes,
    currentPhase: 'execution',
    nextExpectedActor: 'planning-manager',
    activeDispatch: null,
    completedDeliverables: [],
    childDispatchSessionIDs: {
      planning: [],
      execution: [],
      acceptance: [],
      capabilityHands: {},
      probes: {},
      acceptanceClosure: [],
    },
  });

  assert.deepEqual(state.pendingManagers, ['execution-manager', 'acceptance-manager']);
  assert.equal(state.nextExpectedActor, 'execution-manager');
});
