import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import * as plugin from '../dist/index.js';

async function createWorkspace(prefix) {
  const workspace = await mkdtemp(path.join(os.tmpdir(), prefix));
  await mkdir(path.join(workspace, '.agent-memory'), { recursive: true });
  return workspace;
}

test('loadPluginState migrates version 1 scalar state into schemaVersion 2 graph state on read', async () => {
  const workspace = await createWorkspace('harness-state-migration-');

  const legacyState = {
    version: 1,
    mode: 'harness',
    activeAgent: 'harness-orchestrator',
    requestId: 'req_legacy',
    routeId: 'F-M1',
    taskType: '修复型',
    flowTier: '中流程',
    currentPhase: 'execution',
    nextExpectedActor: 'execution-manager',
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
    completedDeliverables: ['round-contract.md'],
    deferredDispatchState: 'manager_in_progress',
    lastCompletedActor: 'planning-manager',
    lastDispatchError: null,
    childDispatchSessionIDs: {
      planning: ['child_1'],
      execution: ['child_2'],
      acceptance: [],
      capabilityHands: {},
      probes: {},
      acceptanceClosure: [],
    },
    activeDispatch: {
      actor: 'execution-manager',
      phase: 'manager',
      sessionID: 'child_2',
      startedAt: '2026-04-21T00:00:00.000Z',
    },
    blocked: false,
    blockedReason: '',
    semanticLockStatus: 'locked',
    semanticLockText: 'Locked goal: fix the build',
    autopilotEnabled: true,
    createdAt: '2026-04-21T00:00:00.000Z',
    updatedAt: '2026-04-21T00:00:00.000Z',
    rawUserInput: '修复构建报错并补上回归验证',
  };

  await writeFile(
    path.join(workspace, '.agent-memory', 'harness-plugin-state.json'),
    JSON.stringify(legacyState, null, 2),
  );

  const loaded = await plugin.loadPluginState(workspace);

  assert.equal(loaded.state.schemaVersion, 2);
  assert.equal(loaded.state.graph.routeId, 'F-M1');
  assert.ok(loaded.state.graph.steps['manager:planning-manager']);
  assert.ok(loaded.state.graph.steps['manager:execution-manager']);
  assert.deepEqual(loaded.state.compat.pendingManagers, ['execution-manager', 'acceptance-manager']);
  assert.equal(loaded.state.activeDispatch.actor, 'execution-manager');
  assert.equal(loaded.state.stepRuntime['manager:execution-manager'].status, 'in_progress');
  assert.equal(loaded.state.stepRuntime['manager:execution-manager'].activeSessionID, 'child_2');

  await rm(workspace, { recursive: true, force: true });
});

test('initializeHarnessTask intake persists schemaVersion 2 graph-aware state without removing legacy fields', async () => {
  const workspace = await createWorkspace('harness-intake-schema-');

  const hooks = await plugin.server({
    directory: workspace,
    client: {
      session: {
        create: async () => ({ data: { id: 'child_1' } }),
        promptAsync: async () => undefined,
      },
    },
    worktree: '/',
    serverUrl: new URL('http://127.0.0.1:4124/'),
  });

  await hooks['command.execute.before'](
    { command: 'control', arguments: '修复构建报错并补上回归验证', sessionID: 'parent_ses' },
    { parts: [] },
  );

  const persisted = JSON.parse(
    await readFile(path.join(workspace, '.agent-memory', 'harness-plugin-state.json'), 'utf8'),
  );

  assert.equal(persisted.schemaVersion, 2);
  assert.equal(persisted.graph.routeId, 'F-M1');
  assert.ok(persisted.graph.steps['manager:planning-manager']);
  assert.ok(persisted.stepRuntime['manager:planning-manager']);
  assert.deepEqual(persisted.pendingManagers, ['planning-manager', 'execution-manager', 'acceptance-manager']);
  assert.deepEqual(persisted.compat.pendingManagers, persisted.pendingManagers);
  assert.equal(persisted.compat.deferredDispatchState, persisted.deferredDispatchState);

  await rm(workspace, { recursive: true, force: true });
});
