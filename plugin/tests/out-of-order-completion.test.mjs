import test from 'node:test';
import assert from 'node:assert/strict';

import * as plugin from '../dist/index.js';

test('out-of-order completion only finishes the addressed step and keeps current serial dispatch stable', () => {
  const graph = {
    routeId: 'F-M1',
    taskType: '修复型',
    flowTier: '中流程',
    steps: {
      'manager:planning-manager': {
        id: 'manager:planning-manager',
        actor: 'planning-manager',
        kind: 'manager',
        phase: 'planning',
        dependsOnStepIds: [],
        dependsOnSignals: [],
        emitsSignals: [],
        resourceLocks: [],
        completionPolicy: 'legacy-scalar-compat',
        retryPolicy: { maxAttempts: 1, backoffMs: 0 },
        allowedToolsPolicy: 'inherit-runtime',
        producesDeliverables: ['round-contract.md'],
      },
      'manager:execution-manager': {
        id: 'manager:execution-manager',
        actor: 'execution-manager',
        kind: 'manager',
        phase: 'execution',
        dependsOnStepIds: ['manager:planning-manager'],
        dependsOnSignals: [],
        emitsSignals: [],
        resourceLocks: [],
        completionPolicy: 'legacy-scalar-compat',
        retryPolicy: { maxAttempts: 1, backoffMs: 0 },
        allowedToolsPolicy: 'inherit-runtime',
        producesDeliverables: ['execution-status.md'],
      },
      'capability-hand:shell-agent': {
        id: 'capability-hand:shell-agent',
        actor: 'shell-agent',
        kind: 'capability-hand',
        phase: 'execution',
        dependsOnStepIds: ['manager:execution-manager'],
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
    routeId: 'F-M1',
    taskType: '修复型',
    flowTier: '中流程',
    graph,
    stepRuntime: {
      'manager:planning-manager': {
        status: 'in_progress',
        attemptCount: 1,
        activeSessionID: 'child_plan',
        startedAt: '2026-04-21T00:00:00.000Z',
        completedAt: null,
        lastProgressAt: '2026-04-21T00:00:00.000Z',
        completionSource: null,
        lastError: null,
      },
      'manager:execution-manager': {
        status: 'in_progress',
        attemptCount: 1,
        activeSessionID: 'child_exec',
        startedAt: '2026-04-21T00:01:00.000Z',
        completedAt: null,
        lastProgressAt: '2026-04-21T00:01:00.000Z',
        completionSource: null,
        lastError: null,
      },
    },
    activeDispatch: {
      actor: 'execution-manager',
      phase: 'manager',
      stepId: 'manager:execution-manager',
      sessionID: 'child_exec',
      startedAt: '2026-04-21T00:01:00.000Z',
    },
    currentPhase: 'execution',
    nextExpectedActor: 'execution-manager',
    childDispatchSessionIDs: {
      planning: ['child_plan'],
      execution: ['child_exec'],
      acceptance: [],
      capabilityHands: {},
      probes: {},
      acceptanceClosure: [],
    },
  });

  const completed = plugin.completeGraphStep(state, {
    stepId: 'manager:planning-manager',
    source: 'session-store',
    completedAt: '2026-04-21T00:01:30.000Z',
  });

  assert.equal(completed.changed, true);
  assert.equal(completed.state.stepRuntime['manager:planning-manager'].status, 'succeeded');
  assert.equal(completed.state.stepRuntime['manager:execution-manager'].status, 'in_progress');
  assert.equal(completed.state.activeDispatch?.actor, 'execution-manager');
  assert.equal(completed.state.activeDispatch?.stepId, 'manager:execution-manager');
  assert.equal(completed.state.nextExpectedActor, 'execution-manager');
});
