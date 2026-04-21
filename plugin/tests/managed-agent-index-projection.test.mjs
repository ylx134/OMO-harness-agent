import test from 'node:test';
import assert from 'node:assert/strict';

import * as plugin from '../dist/index.js';

test('buildManagedAgentIndexProjection adds graph runtime fields without removing queue compatibility fields', () => {
  const route = plugin.routeConfig('A-M1');
  const graph = plugin.compileRouteGraph({
    routeId: 'A-M1',
    route,
    selectedCapabilityHands: ['docs-agent', 'code-agent', 'shell-agent', 'evidence-agent'],
    selectedProbes: ['api-probe-agent', 'regression-probe-agent', 'artifact-probe-agent'],
  });

  const state = {
    requestId: 'REQ-20260421-000002',
    routeId: 'A-M1',
    taskType: route.taskType,
    flowTier: route.flowTier,
    semanticLockStatus: 'locked',
    semanticLockText: 'Locked goal: deepen hidden capability',
    currentPhase: 'execution',
    nextExpectedActor: 'docs-agent',
    blocked: false,
    blockedReason: '',
    requiredManagers: ['capability-planner', 'planning-manager', 'execution-manager', 'acceptance-manager'],
    pendingManagers: ['acceptance-manager'],
    dispatchedManagers: ['capability-planner', 'planning-manager', 'execution-manager'],
    requiredCapabilityHands: ['docs-agent', 'code-agent', 'shell-agent', 'evidence-agent'],
    selectedCapabilityHands: ['docs-agent', 'code-agent', 'shell-agent', 'evidence-agent'],
    pendingCapabilityHands: ['docs-agent', 'shell-agent'],
    dispatchedCapabilityHands: ['code-agent'],
    requiredProbes: ['api-probe-agent', 'regression-probe-agent', 'artifact-probe-agent'],
    selectedProbes: ['api-probe-agent', 'regression-probe-agent', 'artifact-probe-agent'],
    pendingProbes: ['api-probe-agent', 'regression-probe-agent', 'artifact-probe-agent'],
    dispatchedProbes: [],
    deferredDispatchState: 'ready',
    lastCompletedActor: 'execution-manager',
    graph,
    stepRuntime: {
      'manager:capability-planner': {
        status: 'succeeded',
      },
      'manager:planning-manager': {
        status: 'succeeded',
      },
      'manager:execution-manager': {
        status: 'succeeded',
      },
      'capability-hand:docs-agent': {
        status: 'ready',
      },
      'capability-hand:code-agent': {
        status: 'in_progress',
        activeSessionID: 'child_code',
      },
      'capability-hand:shell-agent': {
        status: 'ready',
      },
      'capability-hand:evidence-agent': {
        status: 'succeeded',
      },
      'manager:acceptance-manager': {
        status: 'pending',
      },
      'probe:api-probe-agent': {
        status: 'blocked',
      },
      'probe:regression-probe-agent': {
        status: 'pending',
      },
      'probe:artifact-probe-agent': {
        status: 'pending',
      },
      'acceptance-closure:acceptance-manager': {
        status: 'pending',
      },
    },
    activeStepIds: ['capability-hand:code-agent'],
    readyStepIds: ['capability-hand:docs-agent', 'capability-hand:shell-agent'],
    blockedStepIds: ['probe:api-probe-agent'],
    heldLocks: {
      'workspace-write': 'capability-hand:code-agent',
    },
    signals: {
      'capability-spec-ready': {
        emitted: true,
        emittedAt: '2026-04-21T00:10:00.000Z',
        emittedByStepId: 'manager:planning-manager',
        payloadRef: '.agent-memory/capability-map.md',
      },
      'api-proof-ready': {
        emitted: false,
        emittedAt: null,
        emittedByStepId: null,
        payloadRef: null,
      },
    },
  };

  const index = plugin.buildManagedAgentIndexProjection(state);

  assert.equal(index.route.route_id, 'A-M1');
  assert.deepEqual(index.pending_manager_dispatch, ['acceptance-manager']);
  assert.deepEqual(index.pending_capability_hands, ['docs-agent', 'code-agent', 'shell-agent']);
  assert.deepEqual(index.pending_probes, ['api-probe-agent', 'regression-probe-agent', 'artifact-probe-agent']);
  assert.equal(index.deferred_dispatch_state, 'ready');
  assert.deepEqual(index.graph_runtime.active_step_ids, ['capability-hand:code-agent']);
  assert.deepEqual(index.graph_runtime.ready_step_ids, ['capability-hand:docs-agent', 'capability-hand:shell-agent']);
  assert.deepEqual(index.graph_runtime.blocked_step_ids, ['probe:api-probe-agent']);
  assert.deepEqual(index.graph_runtime.held_locks, {
    'workspace-write': 'capability-hand:code-agent',
  });
  assert.deepEqual(index.graph_runtime.signal_summary, {
    total: 2,
    emitted: 1,
    pending: 1,
    emitted_signal_names: ['capability-spec-ready'],
    pending_signal_names: ['api-proof-ready'],
  });
  assert.deepEqual(index.legacy_compat, {
    next_expected_actor: 'docs-agent',
    deferred_dispatch_state: 'ready',
    pending_managers: ['acceptance-manager'],
    pending_capability_hands: ['docs-agent', 'code-agent', 'shell-agent'],
    pending_probes: ['api-probe-agent', 'regression-probe-agent', 'artifact-probe-agent'],
    active_dispatch: {
      actor: 'code-agent',
      phase: 'capability-hand',
      sessionID: 'child_code',
      stepId: 'capability-hand:code-agent',
      startedAt: null,
    },
  });
});
