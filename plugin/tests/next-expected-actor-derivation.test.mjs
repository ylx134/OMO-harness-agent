import test from 'node:test';
import assert from 'node:assert/strict';

import * as plugin from '../dist/index.js';

function createState(overrides = {}) {
  const route = plugin.routeConfig('F-M1');
  const graph = plugin.compileRouteGraph({
    routeId: 'F-M1',
    route,
    selectedCapabilityHands: ['shell-agent', 'code-agent', 'evidence-agent'],
    selectedProbes: ['regression-probe-agent', 'artifact-probe-agent'],
  });

  return {
    mode: 'harness',
    requestId: 'REQ-NEXT-EXPECTED-ACTOR',
    routeId: 'F-M1',
    taskType: route.taskType,
    flowTier: route.flowTier,
    semanticLockStatus: 'locked',
    semanticLockText: 'Locked goal: fix the build',
    currentPhase: 'execution',
    blocked: false,
    blockedReason: '',
    requiredManagers: route.managers,
    pendingManagers: ['acceptance-manager'],
    dispatchedManagers: ['planning-manager', 'execution-manager'],
    requiredCapabilityHands: route.capability,
    selectedCapabilityHands: route.capability,
    pendingCapabilityHands: ['shell-agent', 'code-agent', 'evidence-agent'],
    dispatchedCapabilityHands: [],
    requiredProbes: route.probes,
    selectedProbes: route.probes,
    pendingProbes: route.probes,
    dispatchedProbes: [],
    deferredDispatchState: 'hand_in_progress',
    lastCompletedActor: 'execution-manager',
    nextExpectedActor: 'shell-agent',
    activeDispatch: {
      actor: 'shell-agent',
      phase: 'capability-hand',
      sessionID: 'child_shell',
      stepId: 'capability-hand:shell-agent',
      startedAt: '2026-04-23T00:03:00.000Z',
    },
    childDispatchSessionIDs: {
      planning: ['child_plan'],
      execution: ['child_exec'],
      acceptance: [],
      capabilityHands: {},
      probes: {},
      acceptanceClosure: [],
    },
    graph,
    stepRuntime: {
      'manager:planning-manager': { status: 'succeeded', attemptCount: 1, activeSessionID: null, startedAt: null, completedAt: null, lastProgressAt: null, completionSource: 'chat', lastError: null },
      'manager:execution-manager': { status: 'succeeded', attemptCount: 1, activeSessionID: null, startedAt: null, completedAt: null, lastProgressAt: null, completionSource: 'chat', lastError: null },
      'capability-hand:shell-agent': { status: 'in_progress', attemptCount: 1, activeSessionID: 'child_shell', startedAt: '2026-04-23T00:03:00.000Z', completedAt: null, lastProgressAt: '2026-04-23T00:03:00.000Z', completionSource: null, lastError: null },
      'capability-hand:code-agent': { status: 'pending', attemptCount: 0, activeSessionID: null, startedAt: null, completedAt: null, lastProgressAt: null, completionSource: null, lastError: null },
      'capability-hand:evidence-agent': { status: 'pending', attemptCount: 0, activeSessionID: null, startedAt: null, completedAt: null, lastProgressAt: null, completionSource: null, lastError: null },
      'manager:acceptance-manager': { status: 'pending', attemptCount: 0, activeSessionID: null, startedAt: null, completedAt: null, lastProgressAt: null, completionSource: null, lastError: null },
      'probe:regression-probe-agent': { status: 'pending', attemptCount: 0, activeSessionID: null, startedAt: null, completedAt: null, lastProgressAt: null, completionSource: null, lastError: null },
      'probe:artifact-probe-agent': { status: 'pending', attemptCount: 0, activeSessionID: null, startedAt: null, completedAt: null, lastProgressAt: null, completionSource: null, lastError: null },
      'acceptance-closure:acceptance-manager': { status: 'pending', attemptCount: 0, activeSessionID: null, startedAt: null, completedAt: null, lastProgressAt: null, completionSource: null, lastError: null },
    },
    activeStepIds: ['capability-hand:shell-agent'],
    readyStepIds: ['capability-hand:code-agent'],
    blockedStepIds: [],
    retryQueue: [],
    heldLocks: {
      'workspace-write': 'capability-hand:shell-agent',
      'build-runner': 'capability-hand:shell-agent',
    },
    signals: {},
    ...overrides,
  };
}

test('nextExpectedActor derivation stays aligned across legacy projection, migration, and recovery', () => {
  const rawState = createState();

  const projected = plugin.projectLegacyState(rawState);
  const migrated = plugin.ensureGraphState(rawState);
  const recovered = plugin.recoverGraphRuntimeState(migrated);
  const managedAgentIndex = plugin.buildManagedAgentIndexProjection(recovered);

  assert.equal(projected.nextExpectedActor, 'shell-agent');
  assert.equal(migrated.nextExpectedActor, 'shell-agent');
  assert.equal(recovered.nextExpectedActor, 'shell-agent');
  assert.equal(managedAgentIndex.legacy_compat.next_expected_actor, 'shell-agent');
});
