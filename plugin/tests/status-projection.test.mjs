import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import * as plugin from '../dist/index.js';

function createGraphState() {
  const route = plugin.routeConfig('F-M1');
  const graph = plugin.compileRouteGraph({
    routeId: 'F-M1',
    route,
    selectedCapabilityHands: ['shell-agent', 'code-agent', 'evidence-agent'],
    selectedProbes: ['regression-probe-agent', 'artifact-probe-agent'],
  });

  return {
    mode: 'harness',
    requestId: 'REQ-20260421-000001',
    routeId: 'F-M1',
    taskType: route.taskType,
    flowTier: route.flowTier,
    semanticLockStatus: 'locked',
    semanticLockText: 'Locked goal: fix the build',
    currentPhase: 'execution',
    blocked: false,
    blockedReason: '',
    requiredManagers: ['planning-manager', 'execution-manager', 'acceptance-manager'],
    pendingManagers: ['execution-manager', 'acceptance-manager'],
    dispatchedManagers: ['planning-manager'],
    requiredCapabilityHands: ['shell-agent', 'code-agent', 'evidence-agent'],
    selectedCapabilityHands: ['shell-agent', 'code-agent', 'evidence-agent'],
    pendingCapabilityHands: ['shell-agent', 'code-agent', 'evidence-agent'],
    dispatchedCapabilityHands: [],
    requiredProbes: ['regression-probe-agent', 'artifact-probe-agent'],
    selectedProbes: ['regression-probe-agent', 'artifact-probe-agent'],
    pendingProbes: ['regression-probe-agent', 'artifact-probe-agent'],
    dispatchedProbes: [],
    deferredDispatchState: 'hand_in_progress',
    lastCompletedActor: 'planning-manager',
    nextExpectedActor: 'shell-agent',
    activeDispatch: {
      actor: 'shell-agent',
      phase: 'capability-hand',
      sessionID: 'child_shell',
      stepId: 'capability-hand:shell-agent',
      startedAt: '2026-04-21T00:03:00.000Z',
    },
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
        status: 'succeeded',
        attemptCount: 1,
        activeSessionID: null,
        startedAt: '2026-04-21T00:01:00.000Z',
        completedAt: '2026-04-21T00:02:00.000Z',
        lastProgressAt: '2026-04-21T00:02:00.000Z',
        completionSource: 'chat.message',
        lastError: null,
      },
      'capability-hand:shell-agent': {
        status: 'in_progress',
        attemptCount: 1,
        activeSessionID: 'child_shell',
        startedAt: '2026-04-21T00:03:00.000Z',
        completedAt: null,
        lastProgressAt: '2026-04-21T00:03:00.000Z',
        completionSource: null,
        lastError: null,
      },
      'capability-hand:code-agent': {
        status: 'ready',
        attemptCount: 0,
        activeSessionID: null,
        startedAt: null,
        completedAt: null,
        lastProgressAt: null,
        completionSource: null,
        lastError: null,
      },
      'capability-hand:evidence-agent': {
        status: 'blocked',
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
    activeStepIds: ['capability-hand:shell-agent'],
    readyStepIds: ['capability-hand:code-agent'],
    blockedStepIds: ['capability-hand:evidence-agent'],
    retryQueue: [],
    heldLocks: {
      'workspace-write': 'capability-hand:shell-agent',
      'build-runner': 'capability-hand:shell-agent',
    },
    signals: {
      'build-artifacts-ready': {
        emitted: true,
        emittedAt: '2026-04-21T00:02:30.000Z',
        emittedByStepId: 'manager:execution-manager',
        payloadRef: '.agent-memory/artifacts/build.json',
      },
      'verification-summary-ready': {
        emitted: false,
        emittedAt: null,
        emittedByStepId: null,
        payloadRef: null,
      },
    },
  };
}

test('buildStatusProjection renders graph runtime summary alongside legacy compatibility fields', () => {
  const state = createGraphState();
  const route = plugin.routeConfig('F-M1');
  const routePacket = plugin.buildRoutePacketProjection('F-M1', route, state);

  const status = plugin.buildStatusProjection(state, routePacket);

  assert.match(status, /Graph Runtime Summary/);
  assert.match(status, /Active Step IDs: capability-hand:shell-agent/);
  assert.match(status, /Ready Step IDs: capability-hand:code-agent/);
  assert.match(status, /Blocked Step IDs: capability-hand:evidence-agent/);
  assert.match(status, /Held Locks: workspace-write=capability-hand:shell-agent, build-runner=capability-hand:shell-agent/);
  assert.match(status, /Signal Summary: 1 emitted, 1 pending/);
  assert.match(status, /Emitted Signals: build-artifacts-ready/);
  assert.match(status, /Pending Signals: verification-summary-ready/);
  assert.match(status, /Legacy Compatibility View/);
  assert.match(status, /Legacy Pending Managers: acceptance-manager/);
  assert.match(status, /Legacy Pending Capability Hands: shell-agent, code-agent, evidence-agent/);
  assert.match(status, /Legacy Pending Probes: regression-probe-agent, artifact-probe-agent/);
  assert.match(status, /Legacy Deferred Dispatch State: hand_in_progress/);
  assert.match(status, /Legacy Active Dispatch: shell-agent \(capability-hand\) session=child_shell/);
});

test('buildRoutePacketProjection keeps legacy compat visible without letting stale compat mask fresher projected state', () => {
  const route = plugin.routeConfig('F-M1');
  const state = {
    ...createGraphState(),
    compat: {
      activeDispatch: {
        actor: 'planning-manager',
        phase: 'manager',
        sessionID: 'stale_child',
        stepId: 'manager:planning-manager',
        startedAt: '2026-04-21T00:00:30.000Z',
      },
      pendingManagers: ['planning-manager'],
      pendingCapabilityHands: ['shell-agent'],
      pendingProbes: ['artifact-probe-agent'],
      nextExpectedActor: 'planning-manager',
      deferredDispatchState: 'manager_in_progress',
      childDispatchSessionIDs: {
        planning: ['stale_child'],
        execution: [],
        acceptance: [],
        capabilityHands: {},
        probes: {},
        acceptanceClosure: [],
      },
    },
  };

  const routePacket = plugin.buildRoutePacketProjection('F-M1', route, state);

  assert.deepEqual(routePacket.pendingManagers, ['acceptance-manager']);
  assert.deepEqual(routePacket.pendingCapabilityHands, ['shell-agent', 'code-agent', 'evidence-agent']);
  assert.deepEqual(routePacket.pendingProbes, ['regression-probe-agent', 'artifact-probe-agent']);
  assert.equal(routePacket.deferredDispatchState, 'hand_in_progress');
  assert.equal(routePacket.legacyCompat.nextExpectedActor, 'shell-agent');
  assert.deepEqual(routePacket.legacyCompat.activeDispatch, {
    actor: 'shell-agent',
    phase: 'capability-hand',
    sessionID: 'child_shell',
    stepId: 'capability-hand:shell-agent',
    startedAt: '2026-04-21T00:03:00.000Z',
  });
  assert.deepEqual(routePacket.legacyCompat.childDispatchSessionIDs, state.compat.childDispatchSessionIDs);
});

test('initializeHarnessTask writes orchestration status from the projection layer so intake matches sync output', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-init-projection-'));

  try {
    const state = await plugin.initializeHarnessTask(
      workspace,
      '修复构建报错并补上回归验证',
      'harness-orchestrator',
      '',
      false,
    );
    const route = plugin.routeConfig(state.routeId);
    const routePacket = plugin.buildRoutePacketProjection(state.routeId, route, state);
    const expectedStatus = plugin.buildStatusProjection(state, routePacket);
    const persistedStatus = await readFile(path.join(workspace, '.agent-memory', 'orchestration-status.md'), 'utf8');

    assert.equal(persistedStatus, expectedStatus);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
