import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import * as plugin from '../dist/index.js';
import { server } from '../dist/index.js';

function inferActorFromPrompt(text = '') {
  const match = text.match(/Harness plugin as ([^.\n]+)/);
  const actor = match?.[1] || undefined;
  return actor?.startsWith('acceptance-manager') ? 'acceptance-manager' : actor;
}

async function setupHarness(commandText, initialDeliverables = {}) {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-deferred-probe-'));
  await mkdir(path.join(workspace, '.agent-memory'), { recursive: true });
  for (const [name, content] of Object.entries(initialDeliverables)) {
    await writeFile(path.join(workspace, '.agent-memory', name), content);
  }

  const dispatched = [];
  const hooks = await server({
    directory: workspace,
    client: {
      session: {
        create: async () => ({ data: { id: `child_${dispatched.length + 1}` } }),
        promptAsync: async (payload) => {
          dispatched.push({ actor: inferActorFromPrompt(payload.body.parts?.[0]?.text || ''), sessionID: payload.path.id });
        },
      },
    },
    worktree: '/',
    serverUrl: new URL('http://127.0.0.1:4116/'),
  });

  await hooks['command.execute.before'](
    { command: 'control', arguments: commandText, sessionID: 'ses_test' },
    { parts: [] },
  );

  return { workspace, hooks, dispatched };
}

async function readState(workspace) {
  return JSON.parse(await readFile(path.join(workspace, '.agent-memory', 'harness-plugin-state.json'), 'utf8'));
}

async function completeActiveDispatch(workspace, hooks) {
  const state = await readState(workspace);
  await hooks['chat.message'](
    { agent: state.activeDispatch.actor, sessionID: state.activeDispatch.sessionID },
    { parts: [{ type: 'text', text: `${state.activeDispatch.actor} finished real work` }] },
  );
}

async function completeProbeDispatch(workspace, hooks, probeName) {
  const state = await readState(workspace);
  const sessionID = state.stepRuntime?.[`probe:${probeName}`]?.activeSessionID;
  assert.ok(sessionID, `expected live session for ${probeName}`);
  await hooks['chat.message'](
    { agent: probeName, sessionID },
    { parts: [{ type: 'text', text: `${probeName} finished real work` }] },
  );
}

async function reachAcceptanceManager(workspace, hooks) {
  for (let i = 0; i < 5; i += 1) {
    await completeActiveDispatch(workspace, hooks);
  }
}

test('single /control dispatches acceptance-manager before probes and waits for its completion', async () => {
  const { workspace, hooks, dispatched } = await setupHarness('修复构建报错并补上回归验证');

  await reachAcceptanceManager(workspace, hooks);

  let after = await readState(workspace);
  assert.deepEqual(dispatched.map((entry) => entry.actor), [
    'planning-manager',
    'execution-manager',
    'shell-agent',
    'evidence-agent',
    'code-agent',
    'acceptance-manager',
  ]);
  assert.deepEqual(after.pendingManagers, ['acceptance-manager']);
  assert.deepEqual(after.pendingProbes, ['regression-probe-agent', 'artifact-probe-agent']);
  assert.equal(after.currentPhase, 'acceptance');
  assert.equal(after.nextExpectedActor, 'acceptance-manager');
  assert.equal(after.activeDispatch?.actor, 'acceptance-manager');

  await completeActiveDispatch(workspace, hooks);

  after = await readState(workspace);
  assert.deepEqual(dispatched.map((entry) => entry.actor), [
    'planning-manager',
    'execution-manager',
    'shell-agent',
    'evidence-agent',
    'code-agent',
    'acceptance-manager',
    'regression-probe-agent',
    'artifact-probe-agent',
  ]);
  assert.deepEqual(after.pendingManagers, []);
  assert.deepEqual(after.pendingProbes, ['regression-probe-agent', 'artifact-probe-agent']);
  assert.equal(after.lastCompletedActor, 'acceptance-manager');
  assert.deepEqual(new Set(after.activeStepIds), new Set(['probe:regression-probe-agent', 'probe:artifact-probe-agent']));
  assert.equal(after.activeDispatch?.actor, 'artifact-probe-agent');

  await rm(workspace, { recursive: true, force: true });
});

test('single /control waits for all live probes before asking for final closure', async () => {
  const { workspace, hooks, dispatched } = await setupHarness('修复构建报错并补上回归验证', {
    'round-contract.md': '# Round Contract\nreal content\n',
    'execution-status.md': '# Execution Status\nreal content\n',
    'evidence-ledger.md': '# Evidence Ledger\nreal content\n',
    'acceptance-report.md': '# Acceptance Report\nreal content\n',
  });

  await reachAcceptanceManager(workspace, hooks);
  await completeActiveDispatch(workspace, hooks);

  let after = await readState(workspace);
  assert.deepEqual(new Set(after.activeStepIds), new Set(['probe:regression-probe-agent', 'probe:artifact-probe-agent']));
  assert.equal(after.activeDispatch?.actor, 'artifact-probe-agent');

  await completeProbeDispatch(workspace, hooks, 'artifact-probe-agent');
  after = await readState(workspace);
  assert.deepEqual(after.pendingProbes, ['regression-probe-agent']);
  assert.deepEqual(after.activeStepIds, ['probe:regression-probe-agent']);
  assert.equal(after.activeDispatch?.actor, 'regression-probe-agent');
  assert.equal(after.deferredDispatchState, 'ready');

  await completeProbeDispatch(workspace, hooks, 'regression-probe-agent');
  after = await readState(workspace);
  assert.deepEqual(after.pendingProbes, []);
  assert.equal(after.activeDispatch?.actor, 'acceptance-manager');
  assert.equal(after.currentPhase, 'acceptance');
  assert.equal(after.deferredDispatchState, 'acceptance_closure_in_progress');

  const debug = await readFile(path.join(workspace, '.agent-memory', 'harness-plugin-debug.log'), 'utf8');
  assert.match(debug, /deferred\.probe\.dispatch\.requested/);
  assert.match(debug, /deferred\.acceptance\.closure\.requested/);
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

  await rm(workspace, { recursive: true, force: true });
});

test('/check dispatches acceptance closure from graph readiness even when compat pendingProbes still contains an unreachable probe', async () => {
  const { workspace, hooks, dispatched } = await setupHarness('修复构建报错并补上回归验证', {
    'round-contract.md': '# Round Contract\nreal content\n',
    'execution-status.md': '# Execution Status\nreal content\n',
    'evidence-ledger.md': '# Evidence Ledger\nreal content\n',
    'acceptance-report.md': '# Acceptance Report\nreal content\n',
  });

  const graph = {
    routeId: 'check-closure-gap',
    taskType: 'fix',
    flowTier: 'M1',
    steps: {
      'manager:acceptance-manager': {
        id: 'manager:acceptance-manager',
        actor: 'acceptance-manager',
        kind: 'manager',
        phase: 'acceptance',
        dependsOnStepIds: [],
        dependsOnSignals: [],
        emitsSignals: [],
        resourceLocks: [],
        completionPolicy: 'legacy-scalar-compat',
        retryPolicy: { maxAttempts: 1, backoffMs: 0 },
        allowedToolsPolicy: 'inherit-runtime',
        producesDeliverables: [],
      },
      'probe:required-probe': {
        id: 'probe:required-probe',
        actor: 'required-probe',
        kind: 'probe',
        phase: 'acceptance',
        dependsOnStepIds: ['manager:acceptance-manager'],
        dependsOnSignals: [],
        emitsSignals: [],
        resourceLocks: [],
        completionPolicy: 'legacy-scalar-compat',
        retryPolicy: { maxAttempts: 1, backoffMs: 0 },
        allowedToolsPolicy: 'inherit-runtime',
        producesDeliverables: [],
      },
      'probe:orphaned-probe': {
        id: 'probe:orphaned-probe',
        actor: 'orphaned-probe',
        kind: 'probe',
        phase: 'acceptance',
        dependsOnStepIds: ['manager:acceptance-manager'],
        dependsOnSignals: ['never-emitted'],
        emitsSignals: [],
        resourceLocks: [],
        completionPolicy: 'legacy-scalar-compat',
        retryPolicy: { maxAttempts: 1, backoffMs: 0 },
        allowedToolsPolicy: 'inherit-runtime',
        producesDeliverables: [],
      },
      'acceptance-closure:acceptance-manager': {
        id: 'acceptance-closure:acceptance-manager',
        actor: 'acceptance-manager',
        kind: 'acceptance-closure',
        phase: 'acceptance',
        dependsOnStepIds: ['probe:required-probe'],
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

  const crafted = plugin.ensureGraphState({
    mode: 'harness',
    activeAgent: 'harness-orchestrator',
    requestId: 'REQ-CHECK-CLOSURE-GAP',
    routeId: 'F-M1',
    taskType: 'fix',
    flowTier: 'M1',
    currentPhase: 'acceptance',
    nextExpectedActor: 'acceptance-manager',
    requiredManagers: ['acceptance-manager'],
    pendingManagers: [],
    dispatchedManagers: ['acceptance-manager'],
    requiredCapabilityHands: [],
    selectedCapabilityHands: [],
    pendingCapabilityHands: [],
    dispatchedCapabilityHands: [],
    requiredProbes: ['required-probe', 'orphaned-probe'],
    selectedProbes: ['required-probe', 'orphaned-probe'],
    pendingProbes: ['orphaned-probe'],
    dispatchedProbes: ['required-probe'],
    completedDeliverables: ['round-contract.md', 'execution-status.md', 'evidence-ledger.md', 'acceptance-report.md'],
    deferredDispatchState: 'ready',
    lastCompletedActor: 'required-probe',
    lastDispatchError: null,
    childDispatchSessionIDs: {
      planning: [],
      execution: [],
      acceptance: ['child_accept'],
      capabilityHands: {},
      probes: { 'required-probe': ['child_probe_required'] },
      acceptanceClosure: [],
    },
    activeDispatch: null,
    blocked: false,
    blockedReason: '',
    semanticLockStatus: 'locked',
    semanticLockText: 'Locked goal: close acceptance from graph readiness',
    autopilotEnabled: false,
    createdAt: '2026-04-21T00:00:00.000Z',
    updatedAt: '2026-04-21T00:03:00.000Z',
    rawUserInput: '修复构建报错并补上回归验证',
    graph,
    stepRuntime: {
      'manager:acceptance-manager': {
        status: 'succeeded',
        attemptCount: 1,
        activeSessionID: null,
        startedAt: '2026-04-21T00:00:00.000Z',
        completedAt: '2026-04-21T00:01:00.000Z',
        lastProgressAt: '2026-04-21T00:01:00.000Z',
        completionSource: 'chat',
        lastError: null,
      },
      'probe:required-probe': {
        status: 'succeeded',
        attemptCount: 1,
        activeSessionID: null,
        startedAt: '2026-04-21T00:01:00.000Z',
        completedAt: '2026-04-21T00:02:00.000Z',
        lastProgressAt: '2026-04-21T00:02:00.000Z',
        completionSource: 'chat',
        lastError: null,
      },
      'probe:orphaned-probe': {
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
  });

  await plugin.savePluginState(workspace, crafted);

  await hooks['command.execute.before'](
    { command: 'check', arguments: '', sessionID: 'ses_check' },
    { parts: [] },
  );

  const after = await readState(workspace);
  assert.equal(after.activeDispatch?.actor, 'acceptance-manager');
  assert.equal(after.activeDispatch?.phase, 'acceptance-closure');
  assert.equal(after.deferredDispatchState, 'acceptance_closure_in_progress');
  assert.equal(after.stepRuntime['acceptance-closure:acceptance-manager']?.status, 'in_progress');
  assert.deepEqual(after.pendingProbes, ['orphaned-probe']);
  assert.deepEqual(dispatched.map((entry) => entry.actor), ['planning-manager', 'acceptance-manager']);

  await rm(workspace, { recursive: true, force: true });
});
