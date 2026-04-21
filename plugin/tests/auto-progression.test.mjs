import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import * as plugin from '../dist/index.js';

const { server } = plugin;

function inferActorFromPrompt(text = '') {
  const match = text.match(/Harness plugin as ([^.\n]+)/);
  const actor = match?.[1] || undefined;
  return actor?.startsWith('acceptance-manager') ? 'acceptance-manager' : actor;
}

async function setupWorkspace(deliverables = {}) {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-auto-progress-'));
  await mkdir(path.join(workspace, '.agent-memory'), { recursive: true });
  for (const [name, content] of Object.entries(deliverables)) {
    await writeFile(path.join(workspace, '.agent-memory', name), content);
  }

  const dispatched = [];
  const createdSessions = [];
  const hooks = await server({
    directory: workspace,
    client: {
      session: {
        create: async (payload) => {
          createdSessions.push(payload);
          return { data: { id: `child_${createdSessions.length}` } };
        },
        promptAsync: async (payload) => {
          dispatched.push({
            actor: inferActorFromPrompt(payload.body.parts?.[0]?.text || ''),
            sessionID: payload.path.id,
            text: payload.body.parts?.[0]?.text || '',
          });
        },
      },
    },
    worktree: '/',
    serverUrl: new URL('http://127.0.0.1:4124/'),
  });
  return { workspace, hooks, dispatched, createdSessions };
}

async function readState(workspace) {
  return JSON.parse(await readFile(path.join(workspace, '.agent-memory', 'harness-plugin-state.json'), 'utf8'));
}

async function emitCompletion(hooks, agent, sessionID, text = `${agent} completed real work`) {
  const output = { parts: [{ type: 'text', text }] };
  await hooks['chat.message']({ agent, sessionID }, output);
  return output;
}

test('clear /control auto-starts by dispatching only the first legal actor and then waits', async () => {
  const { workspace, hooks, dispatched, createdSessions } = await setupWorkspace();

  await hooks['command.execute.before'](
    { command: 'control', arguments: '修复构建报错并补上回归验证', sessionID: 'parent_ses' },
    { parts: [] },
  );

  const state = await readState(workspace);
  assert.deepEqual(dispatched.map((entry) => entry.actor), ['planning-manager']);
  assert.equal(createdSessions.length, 1);
  assert.equal(state.currentPhase, 'planning');
  assert.equal(state.nextExpectedActor, 'planning-manager');
  assert.deepEqual(state.pendingManagers, ['planning-manager', 'execution-manager', 'acceptance-manager']);
  assert.deepEqual(state.pendingCapabilityHands, ['shell-agent', 'code-agent', 'evidence-agent']);
  assert.deepEqual(state.pendingProbes, ['regression-probe-agent', 'artifact-probe-agent']);
  assert.equal(state.deferredDispatchState, 'manager_in_progress');
  assert.equal(state.lastCompletedActor, 'none');
  assert.equal(state.activeDispatch?.actor, 'planning-manager');
  assert.equal(state.activeDispatch?.sessionID, 'child_1');

  await rm(workspace, { recursive: true, force: true });
});

test('clear /control advances one child completion at a time until final success', async () => {
  const deliverables = {
    'round-contract.md': '# Round Contract\nreal content\n',
    'execution-status.md': '# Execution Status\nreal content\n',
    'evidence-ledger.md': '# Evidence Ledger\nreal content\n',
    'acceptance-report.md': '# Acceptance Report\nreal content\n',
  };
  const { workspace, hooks, dispatched } = await setupWorkspace(deliverables);

  await hooks['command.execute.before'](
    { command: 'control', arguments: '修复构建报错并补上回归验证', sessionID: 'parent_ses' },
    { parts: [] },
  );

  let state = await readState(workspace);
  const plannedSession = state.activeDispatch.sessionID;

  await emitCompletion(
    hooks,
    'planning-manager',
    plannedSession,
    'You are being auto-dispatched by the Harness plugin as planning-manager.',
  );

  state = await readState(workspace);
  assert.deepEqual(dispatched.map((entry) => entry.actor), ['planning-manager']);
  assert.equal(state.activeDispatch?.actor, 'planning-manager');
  assert.equal(state.lastCompletedActor, 'none');

  const completionSequence = [
    'planning-manager',
    'execution-manager',
    'evidence-agent',
    'shell-agent',
    'code-agent',
    'acceptance-manager',
    'artifact-probe-agent',
    'regression-probe-agent',
    'acceptance-manager',
  ];

  for (const agent of completionSequence) {
    state = await readState(workspace);
    assert.equal(state.activeDispatch?.actor, agent);
    await emitCompletion(hooks, agent, state.activeDispatch.sessionID);
  }

  state = await readState(workspace);
  assert.deepEqual(dispatched.map((entry) => entry.actor), [
    'planning-manager',
    'execution-manager',
    'shell-agent',
    'evidence-agent',
    'code-agent',
    'acceptance-manager',
    'regression-probe-agent',
    'artifact-probe-agent',
    'acceptance-manager',
  ]);
  assert.equal(state.currentPhase, 'complete');
  assert.equal(state.nextExpectedActor, 'none');
  assert.deepEqual(state.pendingManagers, []);
  assert.deepEqual(state.pendingCapabilityHands, []);
  assert.deepEqual(state.pendingProbes, []);
  assert.equal(state.deferredDispatchState, 'complete');
  assert.equal(state.lastCompletedActor, 'acceptance-manager');
  assert.equal(state.activeDispatch, null);

  await rm(workspace, { recursive: true, force: true });
});

test('invalid acceptance-closure completion leaves route state unchanged when graph is still incomplete', async () => {
  const { workspace, hooks } = await setupWorkspace();
  const route = plugin.routeConfig('F-M1');
  const graph = plugin.compileRouteGraph({
    routeId: 'F-M1',
    route,
    selectedCapabilityHands: route.capability,
    selectedProbes: route.probes,
  });

  const crafted = plugin.ensureGraphState({
    mode: 'harness',
    activeAgent: 'harness-orchestrator',
    requestId: 'REQ-TEST-NOOP',
    routeId: 'F-M1',
    taskType: route.taskType,
    flowTier: route.flowTier,
    currentPhase: 'acceptance',
    nextExpectedActor: 'acceptance-manager',
    requiredManagers: route.managers,
    pendingManagers: [],
    dispatchedManagers: ['planning-manager', 'execution-manager', 'acceptance-manager'],
    requiredCapabilityHands: route.capability,
    selectedCapabilityHands: route.capability,
    pendingCapabilityHands: [],
    dispatchedCapabilityHands: route.capability,
    requiredProbes: route.probes,
    selectedProbes: route.probes,
    pendingProbes: route.probes,
    dispatchedProbes: [],
    completedDeliverables: [],
    deferredDispatchState: 'acceptance_closure_in_progress',
    lastCompletedActor: 'acceptance-manager',
    lastDispatchError: null,
    childDispatchSessionIDs: {
      planning: ['child_plan'],
      execution: ['child_exec'],
      acceptance: ['child_accept'],
      capabilityHands: {},
      probes: {},
      acceptanceClosure: ['child_close'],
    },
    activeDispatch: {
      actor: 'acceptance-manager',
      phase: 'acceptance-closure',
      stepId: 'acceptance-closure:acceptance-manager',
      sessionID: 'child_close',
      startedAt: '2026-04-21T00:10:00.000Z',
    },
    blocked: false,
    blockedReason: '',
    semanticLockStatus: 'locked',
    semanticLockText: 'Locked goal: acceptance closure should wait',
    autopilotEnabled: false,
    createdAt: '2026-04-21T00:00:00.000Z',
    updatedAt: '2026-04-21T00:10:00.000Z',
    rawUserInput: '修复构建报错并补上回归验证',
    graph,
    stepRuntime: {
      'manager:planning-manager': {
        status: 'succeeded',
        attemptCount: 1,
        activeSessionID: null,
        startedAt: '2026-04-21T00:00:00.000Z',
        completedAt: '2026-04-21T00:01:00.000Z',
        lastProgressAt: '2026-04-21T00:01:00.000Z',
        completionSource: 'chat',
        lastError: null,
      },
      'manager:execution-manager': {
        status: 'succeeded',
        attemptCount: 1,
        activeSessionID: null,
        startedAt: '2026-04-21T00:01:00.000Z',
        completedAt: '2026-04-21T00:02:00.000Z',
        lastProgressAt: '2026-04-21T00:02:00.000Z',
        completionSource: 'chat',
        lastError: null,
      },
      'capability-hand:shell-agent': {
        status: 'succeeded',
        attemptCount: 1,
        activeSessionID: null,
        startedAt: '2026-04-21T00:02:00.000Z',
        completedAt: '2026-04-21T00:03:00.000Z',
        lastProgressAt: '2026-04-21T00:03:00.000Z',
        completionSource: 'chat',
        lastError: null,
      },
      'capability-hand:code-agent': {
        status: 'succeeded',
        attemptCount: 1,
        activeSessionID: null,
        startedAt: '2026-04-21T00:03:00.000Z',
        completedAt: '2026-04-21T00:04:00.000Z',
        lastProgressAt: '2026-04-21T00:04:00.000Z',
        completionSource: 'chat',
        lastError: null,
      },
      'capability-hand:evidence-agent': {
        status: 'succeeded',
        attemptCount: 1,
        activeSessionID: null,
        startedAt: '2026-04-21T00:04:00.000Z',
        completedAt: '2026-04-21T00:05:00.000Z',
        lastProgressAt: '2026-04-21T00:05:00.000Z',
        completionSource: 'chat',
        lastError: null,
      },
      'manager:acceptance-manager': {
        status: 'succeeded',
        attemptCount: 1,
        activeSessionID: null,
        startedAt: '2026-04-21T00:05:00.000Z',
        completedAt: '2026-04-21T00:06:00.000Z',
        lastProgressAt: '2026-04-21T00:06:00.000Z',
        completionSource: 'chat',
        lastError: null,
      },
      'acceptance-closure:acceptance-manager': {
        status: 'in_progress',
        attemptCount: 1,
        activeSessionID: 'child_close',
        startedAt: '2026-04-21T00:10:00.000Z',
        completedAt: null,
        lastProgressAt: '2026-04-21T00:10:00.000Z',
        completionSource: null,
        lastError: null,
      },
    },
  });

  await plugin.savePluginState(workspace, crafted);

  await hooks['chat.message'](
    { agent: 'acceptance-manager', sessionID: 'child_close' },
    { parts: [{ type: 'text', text: 'acceptance closure claims completion' }] },
  );

  const after = await readState(workspace);
  assert.equal(after.currentPhase, 'acceptance');
  assert.equal(after.deferredDispatchState, 'acceptance_closure_in_progress');
  assert.deepEqual(after.pendingProbes, ['regression-probe-agent', 'artifact-probe-agent']);
  assert.equal(after.activeDispatch?.stepId, 'acceptance-closure:acceptance-manager');
  assert.equal(after.stepRuntime['acceptance-closure:acceptance-manager']?.status, 'in_progress');
  assert.equal(after.currentPhase === 'complete', false);

  await rm(workspace, { recursive: true, force: true });
});
