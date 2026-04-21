import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { server } from '../dist/index.js';

function inferActorFromPrompt(text = '') {
  const match = text.match(/Harness plugin as ([^.\n]+)/);
  const actor = match?.[1] || undefined;
  return actor?.startsWith('acceptance-manager') ? 'acceptance-manager' : actor;
}

function createWaitingGraph() {
  return {
    routeId: 'waiting-route',
    taskType: '测试型',
    flowTier: '中流程',
    steps: {
      'manager:execution-manager': {
        id: 'manager:execution-manager',
        actor: 'execution-manager',
        kind: 'manager',
        phase: 'execution',
        dependsOnStepIds: [],
        dependsOnSignals: [],
        emitsSignals: [],
        resourceLocks: [],
        completionPolicy: 'legacy-scalar-compat',
        retryPolicy: { maxAttempts: 1, backoffMs: 0 },
        allowedToolsPolicy: 'inherit-runtime',
        producesDeliverables: [],
      },
      'capability-hand:a-prep': {
        id: 'capability-hand:a-prep',
        actor: 'docs-agent',
        kind: 'capability-hand',
        phase: 'execution',
        dependsOnStepIds: ['manager:execution-manager'],
        dependsOnSignals: [],
        emitsSignals: ['data-ready'],
        resourceLocks: [],
        completionPolicy: 'legacy-scalar-compat',
        retryPolicy: { maxAttempts: 1, backoffMs: 0 },
        allowedToolsPolicy: 'inherit-runtime',
        producesDeliverables: [],
      },
      'capability-hand:b-finish': {
        id: 'capability-hand:b-finish',
        actor: 'shell-agent',
        kind: 'capability-hand',
        phase: 'execution',
        dependsOnStepIds: ['manager:execution-manager'],
        dependsOnSignals: ['data-ready'],
        emitsSignals: [],
        resourceLocks: [],
        completionPolicy: 'legacy-scalar-compat',
        retryPolicy: { maxAttempts: 1, backoffMs: 0 },
        allowedToolsPolicy: 'inherit-runtime',
        producesDeliverables: [],
      },
      'manager:acceptance-manager': {
        id: 'manager:acceptance-manager',
        actor: 'acceptance-manager',
        kind: 'manager',
        phase: 'acceptance',
        dependsOnStepIds: ['capability-hand:b-finish'],
        dependsOnSignals: [],
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
        dependsOnStepIds: ['manager:acceptance-manager'],
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
}

async function setupWorkspace() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-waiting-step-wakeup-'));
  await mkdir(path.join(workspace, '.agent-memory'), { recursive: true });

  const dispatched = [];
  const hooks = await server({
    directory: workspace,
    client: {
      session: {
        create: async () => ({ data: { id: `child_${dispatched.length + 1}` } }),
        promptAsync: async (payload) => {
          const text = payload.body.parts?.[0]?.text || '';
          dispatched.push({
            actor: inferActorFromPrompt(text),
            sessionID: payload.path.id,
            text,
          });
        },
      },
    },
    worktree: '/',
    serverUrl: new URL('http://127.0.0.1:4127/'),
  });

  return { workspace, hooks, dispatched };
}

async function seedState(workspace) {
  const state = {
    schemaVersion: 2,
    mode: 'harness',
    autopilotEnabled: true,
    routeId: 'waiting-route',
    requestId: 'REQ-WAITING',
    taskType: '测试型',
    flowTier: '中流程',
    graph: createWaitingGraph(),
    signals: {},
    stepRuntime: {
      'manager:execution-manager': {
        status: 'succeeded',
        attemptCount: 1,
        activeSessionID: null,
        startedAt: '2026-04-21T00:00:00.000Z',
        completedAt: '2026-04-21T00:01:00.000Z',
        lastProgressAt: '2026-04-21T00:01:00.000Z',
        completionSource: 'session-store',
        lastError: null,
      },
      'capability-hand:a-prep': {
        status: 'pending',
        attemptCount: 0,
        activeSessionID: null,
        startedAt: null,
        completedAt: null,
        lastProgressAt: null,
        completionSource: null,
        lastError: null,
      },
      'capability-hand:b-finish': {
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
    pendingManagers: ['acceptance-manager'],
    pendingCapabilityHands: ['docs-agent', 'shell-agent'],
    pendingProbes: [],
    requiredManagers: ['execution-manager', 'acceptance-manager'],
    requiredCapabilityHands: ['docs-agent', 'shell-agent'],
    selectedCapabilityHands: ['docs-agent', 'shell-agent'],
    requiredProbes: [],
    selectedProbes: [],
    dispatchedManagers: ['execution-manager'],
    dispatchedCapabilityHands: [],
    dispatchedProbes: [],
    currentPhase: 'execution',
    nextExpectedActor: 'docs-agent',
    deferredDispatchState: 'ready',
    childDispatchSessionIDs: {
      planning: [],
      execution: ['child_exec'],
      acceptance: [],
      capabilityHands: {},
      probes: {},
      acceptanceClosure: [],
    },
  };

  await writeFile(
    path.join(workspace, '.agent-memory', 'harness-plugin-state.json'),
    `${JSON.stringify(state, null, 2)}\n`,
    'utf8',
  );
}

async function readState(workspace) {
  return JSON.parse(await readFile(path.join(workspace, '.agent-memory', 'harness-plugin-state.json'), 'utf8'));
}

test('reconcile keeps signal-blocked steps idle until the emitting step completes, then wakes and dispatches them', async () => {
  const { workspace, hooks, dispatched } = await setupWorkspace();
  await seedState(workspace);

  await hooks['command.execute.before'](
    { command: 'drive', arguments: '', sessionID: 'parent_ses' },
    { parts: [] },
  );

  let state = await readState(workspace);
  assert.deepEqual(dispatched.map((entry) => entry.actor), ['docs-agent']);
  assert.equal(state.activeDispatch?.actor, 'docs-agent');
  assert.deepEqual(state.blockedStepIds, ['capability-hand:b-finish']);
  assert.deepEqual(state.readyStepIds, []);

  await hooks['chat.message'](
    { agent: 'docs-agent', sessionID: state.activeDispatch.sessionID },
    { parts: [{ type: 'text', text: 'docs-agent finished real work' }] },
  );

  state = await readState(workspace);
  assert.equal(state.signals['data-ready']?.emitted, true);
  assert.deepEqual(dispatched.map((entry) => entry.actor), ['docs-agent', 'shell-agent']);
  assert.equal(state.activeDispatch?.actor, 'shell-agent');
  assert.deepEqual(state.blockedStepIds, []);
  assert.equal(state.stepRuntime['capability-hand:b-finish']?.status, 'in_progress');

  await rm(workspace, { recursive: true, force: true });
});
