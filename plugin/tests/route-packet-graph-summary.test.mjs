import test from 'node:test';
import assert from 'node:assert/strict';

import * as plugin from '../dist/index.js';

test('buildRoutePacketProjection adds graph summary fields while preserving legacy route packet queues', () => {
  const route = plugin.routeConfig('P-H1');
  const graph = plugin.compileRouteGraph({
    routeId: 'P-H1',
    route,
    selectedCapabilityHands: ['browser-agent', 'docs-agent', 'code-agent', 'shell-agent', 'evidence-agent'],
    selectedProbes: ['ui-probe-agent', 'regression-probe-agent', 'artifact-probe-agent'],
  });

  const state = {
    routeId: 'P-H1',
    semanticLockStatus: 'locked',
    semanticLockText: 'Locked goal: build product journey',
    completedDeliverables: ['product-spec.md', 'features.json'],
    blocked: true,
    blockedReason: 'Awaiting QA contract',
    pendingManagers: ['acceptance-manager'],
    pendingCapabilityHands: ['browser-agent'],
    pendingProbes: ['ui-probe-agent', 'regression-probe-agent', 'artifact-probe-agent'],
    deferredDispatchState: 'probe_in_progress',
    lastCompletedActor: 'execution-manager',
    stepRuntime: {
      'manager:feature-planner': {
        status: 'succeeded',
      },
      'manager:planning-manager': {
        status: 'succeeded',
      },
      'manager:execution-manager': {
        status: 'succeeded',
      },
      'capability-hand:browser-agent': {
        status: 'succeeded',
      },
      'capability-hand:docs-agent': {
        status: 'succeeded',
      },
      'capability-hand:code-agent': {
        status: 'succeeded',
      },
      'capability-hand:shell-agent': {
        status: 'succeeded',
      },
      'capability-hand:evidence-agent': {
        status: 'succeeded',
      },
      'manager:acceptance-manager': {
        status: 'succeeded',
      },
      'probe:ui-probe-agent': {
        status: 'in_progress',
        activeSessionID: 'child_ui_probe',
        startedAt: '2026-04-21T00:16:00.000Z',
      },
      'probe:regression-probe-agent': {
        status: 'ready',
      },
      'probe:artifact-probe-agent': {
        status: 'pending',
      },
      'acceptance-closure:acceptance-manager': {
        status: 'blocked',
      },
    },
    activeStepIds: ['probe:ui-probe-agent'],
    readyStepIds: ['probe:regression-probe-agent'],
    blockedStepIds: ['acceptance-closure:acceptance-manager'],
    heldLocks: {},
    signals: {
      'ux-proof-ready': {
        emitted: true,
        emittedAt: '2026-04-21T00:15:00.000Z',
        emittedByStepId: 'capability-hand:browser-agent',
        payloadRef: '.agent-memory/evidence-ledger.md',
      },
      'qa-contract-ready': {
        emitted: false,
        emittedAt: null,
        emittedByStepId: null,
        payloadRef: null,
      },
    },
    compat: {
      activeDispatch: {
        actor: 'ui-probe-agent',
        phase: 'probe',
        sessionID: 'child_ui_probe',
        stepId: 'probe:ui-probe-agent',
        startedAt: '2026-04-21T00:16:00.000Z',
      },
      pendingManagers: ['acceptance-manager'],
      pendingCapabilityHands: ['browser-agent'],
      pendingProbes: ['ui-probe-agent', 'regression-probe-agent', 'artifact-probe-agent'],
      nextExpectedActor: 'ui-probe-agent',
      deferredDispatchState: 'probe_in_progress',
      childDispatchSessionIDs: {
        planning: [],
        execution: ['child_exec'],
        acceptance: ['child_accept'],
        capabilityHands: {},
        probes: { 'ui-probe-agent': ['child_ui_probe'] },
        acceptanceClosure: [],
      },
    },
    graph,
  };

  const routePacket = plugin.buildRoutePacketProjection('P-H1', route, state);

  assert.deepEqual(routePacket.pendingManagers, []);
  assert.deepEqual(routePacket.pendingCapabilityHands, []);
  assert.deepEqual(routePacket.pendingProbes, ['ui-probe-agent', 'regression-probe-agent', 'artifact-probe-agent']);
  assert.equal(routePacket.deferredDispatchState, 'probe_in_progress');
  assert.equal(routePacket.lastCompletedActor, 'execution-manager');
  assert.deepEqual(routePacket.activeStepIds, ['probe:ui-probe-agent']);
  assert.deepEqual(routePacket.readyStepIds, ['probe:regression-probe-agent']);
  assert.deepEqual(routePacket.blockedStepIds, ['acceptance-closure:acceptance-manager']);
  assert.deepEqual(routePacket.heldLocks, {});
  assert.deepEqual(routePacket.signalSummary, {
    total: 2,
    emitted: 1,
    pending: 1,
    emittedSignalNames: ['ux-proof-ready'],
    pendingSignalNames: ['qa-contract-ready'],
  });
  assert.deepEqual(routePacket.legacyCompat, {
    activeDispatch: {
      actor: 'ui-probe-agent',
      phase: 'probe',
      sessionID: 'child_ui_probe',
      stepId: 'probe:ui-probe-agent',
      startedAt: '2026-04-21T00:16:00.000Z',
    },
    pendingManagers: [],
    pendingCapabilityHands: [],
    pendingProbes: ['ui-probe-agent', 'regression-probe-agent', 'artifact-probe-agent'],
    nextExpectedActor: 'ui-probe-agent',
    deferredDispatchState: 'probe_in_progress',
    childDispatchSessionIDs: state.compat.childDispatchSessionIDs,
  });
  assert.deepEqual(routePacket.missingDeliverables, route.deliverables.filter((name) => !state.completedDeliverables.includes(name)));
});
