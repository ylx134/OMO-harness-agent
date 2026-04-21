import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { server } from '../dist/index.js';

function inferActorFromPrompt(text = '') {
  const match = text.match(/Harness plugin as ([^.\n]+)/);
  const actor = match?.[1] || undefined;
  return actor?.startsWith('acceptance-manager') ? 'acceptance-manager' : actor;
}

async function readState(workspace) {
  return JSON.parse(await readFile(path.join(workspace, '.agent-memory', 'harness-plugin-state.json'), 'utf8'));
}

test('legacy live state upgrades through storage and reconciles with serial compatibility budgets by default', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-legacy-live-upgrade-'));
  await mkdir(path.join(workspace, '.agent-memory'), { recursive: true });

  const legacyState = {
    version: 1,
    mode: 'harness',
    activeAgent: 'harness-orchestrator',
    requestId: 'REQ-LEGACY-LIVE',
    routeId: 'F-M1',
    taskType: '修复型',
    flowTier: '中流程',
    currentPhase: 'execution',
    nextExpectedActor: 'execution-manager',
    requiredManagers: ['planning-manager', 'execution-manager', 'acceptance-manager'],
    pendingManagers: ['execution-manager', 'acceptance-manager'],
    dispatchedManagers: ['planning-manager', 'execution-manager'],
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
      planning: ['child_plan'],
      execution: ['child_exec'],
      acceptance: [],
      capabilityHands: {},
      probes: {},
      acceptanceClosure: [],
    },
    activeDispatch: {
      actor: 'execution-manager',
      phase: 'manager',
      sessionID: 'child_exec',
      startedAt: '2026-04-21T00:02:00.000Z',
    },
    blocked: false,
    blockedReason: '',
    semanticLockStatus: 'locked',
    semanticLockText: 'Locked goal: fix the build safely',
    autopilotEnabled: true,
    createdAt: '2026-04-21T00:00:00.000Z',
    updatedAt: '2026-04-21T00:02:00.000Z',
    rawUserInput: '修复构建报错并补上回归验证',
  };

  await writeFile(
    path.join(workspace, '.agent-memory', 'harness-plugin-state.json'),
    JSON.stringify(legacyState, null, 2),
  );

  const dispatched = [];
  const hooks = await server({
    directory: workspace,
    client: {
      session: {
        create: async () => ({ data: { id: `child_${dispatched.length + 1}` } }),
        promptAsync: async (payload) => {
          dispatched.push({
            actor: inferActorFromPrompt(payload.body.parts?.[0]?.text || ''),
            sessionID: payload.path.id,
          });
        },
      },
    },
    worktree: '/',
    serverUrl: new URL('http://127.0.0.1:4130/'),
  });

  await hooks['chat.message'](
    { agent: 'execution-manager', sessionID: 'child_exec' },
    { parts: [{ type: 'text', text: 'execution-manager finished real work' }] },
  );

  const upgraded = await readState(workspace);
  assert.equal(upgraded.schemaVersion, 2);
  assert.equal(upgraded.graphRuntimeRollout?.mode, 'serial-compat');
  assert.deepEqual(upgraded.graphRuntimeRollout?.budgets, { managers: 1, hands: 1, probes: 1 });
  assert.deepEqual(dispatched.map((entry) => entry.actor), ['shell-agent']);
  assert.deepEqual(upgraded.pendingManagers, ['acceptance-manager']);
  assert.deepEqual(upgraded.activeStepIds, ['capability-hand:shell-agent']);
  assert.equal(upgraded.activeDispatch?.actor, 'shell-agent');

  await rm(workspace, { recursive: true, force: true });
});
