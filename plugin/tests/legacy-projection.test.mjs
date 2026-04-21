import test from 'node:test';
import assert from 'node:assert/strict';

import * as plugin from '../dist/index.js';

test('projectLegacyState keeps current operator-facing queues and active dispatch fields available from graph state', () => {
  const route = plugin.routeConfig('F-M1');
  const graph = plugin.compileRouteGraph({
    routeId: 'F-M1',
    route,
    selectedCapabilityHands: ['shell-agent', 'code-agent', 'evidence-agent'],
    selectedProbes: ['regression-probe-agent', 'artifact-probe-agent'],
  });

  const projected = plugin.projectLegacyState({
    schemaVersion: 2,
    routeId: 'F-M1',
    taskType: route.taskType,
    flowTier: route.flowTier,
    currentPhase: 'execution',
    graph,
    stepRuntime: {
      'manager:planning-manager': {
        status: 'succeeded',
        attemptCount: 1,
        activeSessionID: null,
        startedAt: '2026-04-21T00:00:00.000Z',
        completedAt: '2026-04-21T00:01:00.000Z',
        lastProgressAt: '2026-04-21T00:01:00.000Z',
        completionSource: 'chat.message',
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
      'capability-hand:shell-agent': {
        status: 'pending',
        attemptCount: 0,
        activeSessionID: null,
        startedAt: null,
        completedAt: null,
        lastProgressAt: null,
        completionSource: null,
        lastError: null,
      },
      'capability-hand:code-agent': {
        status: 'pending',
        attemptCount: 0,
        activeSessionID: null,
        startedAt: null,
        completedAt: null,
        lastProgressAt: null,
        completionSource: null,
        lastError: null,
      },
      'capability-hand:evidence-agent': {
        status: 'pending',
        attemptCount: 0,
        activeSessionID: null,
        startedAt: null,
        completedAt: null,
        lastProgressAt: null,
        completionSource: null,
        lastError: null,
      },
      'manager:acceptance-manager': {
        status: 'pending',
        attemptCount: 0,
        activeSessionID: null,
        startedAt: null,
        completedAt: null,
        lastProgressAt: null,
        completionSource: null,
        lastError: null,
      },
      'probe:regression-probe-agent': {
        status: 'pending',
        attemptCount: 0,
        activeSessionID: null,
        startedAt: null,
        completedAt: null,
        lastProgressAt: null,
        completionSource: null,
        lastError: null,
      },
      'probe:artifact-probe-agent': {
        status: 'pending',
        attemptCount: 0,
        activeSessionID: null,
        startedAt: null,
        completedAt: null,
        lastProgressAt: null,
        completionSource: null,
        lastError: null,
      },
      'acceptance-closure:acceptance-manager': {
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
    childDispatchSessionIDs: {
      planning: ['child_plan'],
      execution: ['child_exec'],
      acceptance: [],
      capabilityHands: {},
      probes: {},
      acceptanceClosure: [],
    },
    completedDeliverables: ['round-contract.md'],
    blocked: false,
    blockedReason: '',
    semanticLockStatus: 'locked',
    semanticLockText: 'Locked goal: fix the build',
    autopilotEnabled: true,
    createdAt: '2026-04-21T00:00:00.000Z',
    updatedAt: '2026-04-21T00:02:00.000Z',
    rawUserInput: '修复构建报错并补上回归验证',
  });

  assert.deepEqual(projected.pendingManagers, ['execution-manager', 'acceptance-manager']);
  assert.deepEqual(projected.pendingCapabilityHands, ['shell-agent', 'code-agent', 'evidence-agent']);
  assert.deepEqual(projected.pendingProbes, ['regression-probe-agent', 'artifact-probe-agent']);
  assert.equal(projected.nextExpectedActor, 'execution-manager');
  assert.equal(projected.deferredDispatchState, 'manager_in_progress');
  assert.deepEqual(projected.activeDispatch, {
    actor: 'execution-manager',
    phase: 'manager',
    sessionID: 'child_exec',
    stepId: 'manager:execution-manager',
    startedAt: '2026-04-21T00:02:00.000Z',
  });
});
