import test from 'node:test';
import assert from 'node:assert/strict';

import * as plugin from '../dist/index.js';

function buildState(routeId = 'F-M1') {
  const route = plugin.routeConfig(routeId);
  const graph = plugin.compileRouteGraph({
    routeId,
    route,
    selectedCapabilityHands: route.capability,
    selectedProbes: route.probes,
  });
  return plugin.ensureGraphState({
    schemaVersion: 2,
    routeId,
    taskType: route.taskType,
    flowTier: route.flowTier,
    graph,
    stepRuntime: {},
    pendingManagers: route.managers,
    pendingCapabilityHands: route.capability,
    pendingProbes: route.probes,
    deferredDispatchState: 'ready',
    childDispatchSessionIDs: {
      planning: [],
      execution: [],
      acceptance: [],
      capabilityHands: {},
      probes: {},
      acceptanceClosure: [],
    },
    currentPhase: 'planning',
    nextExpectedActor: route.managers[0],
    activeDispatch: null,
    completedDeliverables: [],
    createdAt: '2026-04-21T00:00:00.000Z',
    updatedAt: '2026-04-21T00:00:00.000Z',
    rawUserInput: '修复构建报错并补上回归验证',
  });
}

test('completion policy is step-aware across artifact, tool, and session-store sources', () => {
  const state = buildState();

  assert.equal(
    plugin.canStepCompleteFromSource(state, 'manager:planning-manager', 'workspace-artifact'),
    true,
  );
  assert.equal(
    plugin.canStepCompleteFromSource(state, 'manager:planning-manager', 'session-store'),
    true,
  );
  assert.equal(
    plugin.canStepCompleteFromSource(state, 'capability-hand:shell-agent', 'workspace-artifact'),
    false,
  );
  assert.equal(
    plugin.canStepCompleteFromSource(state, 'capability-hand:shell-agent', 'tool'),
    true,
  );
  assert.equal(
    plugin.canStepCompleteFromSource(state, 'probe:artifact-probe-agent', 'session-store'),
    true,
  );
});

test('duplicate completion is idempotent and does not mutate state twice', () => {
  const state = buildState();

  const first = plugin.completeGraphStep(state, {
    stepId: 'manager:planning-manager',
    source: 'session-store',
    completedAt: '2026-04-21T00:01:00.000Z',
  });

  assert.equal(first.changed, true);
  assert.equal(first.state.stepRuntime['manager:planning-manager'].status, 'succeeded');
  assert.equal(first.state.stepRuntime['manager:planning-manager'].completionSource, 'session-store');

  const second = plugin.completeGraphStep(first.state, {
    stepId: 'manager:planning-manager',
    source: 'session-store',
    completedAt: '2026-04-21T00:02:00.000Z',
  });

  assert.equal(second.changed, false);
  assert.deepEqual(second.state, first.state);
});

test('acceptance closure stays gated until graph completion and deliverables are satisfied', () => {
  const state = buildState();

  const blocked = plugin.completeGraphStep(state, {
    stepId: 'acceptance-closure:acceptance-manager',
    source: 'tool',
    completedAt: '2026-04-21T00:10:00.000Z',
    deliverablesSatisfied: false,
  });

  assert.equal(blocked.changed, false);
  assert.match(blocked.reason || '', /deliverables|graph/i);

  const completedState = plugin.recoverGraphRuntimeState({
    ...state,
    completedDeliverables: ['round-contract.md', 'execution-status.md', 'evidence-ledger.md', 'acceptance-report.md'],
    stepRuntime: Object.fromEntries(
      Object.entries(state.stepRuntime).map(([stepId, runtime]) => [
        stepId,
        stepId === 'acceptance-closure:acceptance-manager'
          ? runtime
          : {
              ...runtime,
              status: 'succeeded',
              completedAt: '2026-04-21T00:09:00.000Z',
              completionSource: 'session-store',
            },
      ]),
    ),
  });

  const closure = plugin.completeGraphStep(completedState, {
    stepId: 'acceptance-closure:acceptance-manager',
    source: 'tool',
    completedAt: '2026-04-21T00:10:00.000Z',
    deliverablesSatisfied: true,
  });

  assert.equal(closure.changed, true);
  assert.equal(closure.state.stepRuntime['acceptance-closure:acceptance-manager'].status, 'succeeded');
});
