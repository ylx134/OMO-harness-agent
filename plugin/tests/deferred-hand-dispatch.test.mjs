import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { server } from '../dist/index.js';

function inferActorFromPrompt(text = '') {
  const match = text.match(/Harness plugin as ([^.\n]+)/);
  const actor = match?.[1] || undefined;
  return actor?.startsWith('acceptance-manager') ? 'acceptance-manager' : actor;
}

async function setupHarness(commandText) {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-deferred-hand-'));
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

test('single /control keeps execution-manager ahead of capability hands until execution-manager actually completes', async () => {
  const { workspace, hooks, dispatched } = await setupHarness('修复构建报错并补上回归验证');

  await completeActiveDispatch(workspace, hooks);

  let after = await readState(workspace);
  assert.deepEqual(dispatched.map((entry) => entry.actor), ['planning-manager', 'execution-manager']);
  assert.deepEqual(after.pendingManagers, ['execution-manager', 'acceptance-manager']);
  assert.deepEqual(after.pendingCapabilityHands, ['shell-agent', 'code-agent', 'evidence-agent']);
  assert.equal(after.activeDispatch?.actor, 'execution-manager');

  await completeActiveDispatch(workspace, hooks);

  after = await readState(workspace);
  assert.deepEqual(dispatched.map((entry) => entry.actor), ['planning-manager', 'execution-manager', 'shell-agent', 'evidence-agent']);
  assert.deepEqual(after.pendingManagers, ['acceptance-manager']);
  assert.deepEqual(after.pendingCapabilityHands, ['shell-agent', 'code-agent', 'evidence-agent']);
  assert.equal(after.lastCompletedActor, 'execution-manager');
  assert.deepEqual(new Set(after.activeStepIds), new Set(['capability-hand:shell-agent', 'capability-hand:evidence-agent']));
  assert.equal(after.activeDispatch?.actor, 'evidence-agent');

  await rm(workspace, { recursive: true, force: true });
});

test('single /control dispatches non-conflicting capability hands together and waits for lock-conflicting hands', async () => {
  const { workspace, hooks, dispatched } = await setupHarness('修复构建报错并补上回归验证');

  await completeActiveDispatch(workspace, hooks);
  await completeActiveDispatch(workspace, hooks);

  let after = await readState(workspace);
  assert.deepEqual(dispatched.map((entry) => entry.actor), ['planning-manager', 'execution-manager', 'shell-agent', 'evidence-agent']);
  assert.deepEqual(after.pendingCapabilityHands, ['shell-agent', 'code-agent', 'evidence-agent']);
  assert.deepEqual(new Set(after.activeStepIds), new Set(['capability-hand:shell-agent', 'capability-hand:evidence-agent']));
  assert.equal(after.activeDispatch?.actor, 'evidence-agent');

  await completeActiveDispatch(workspace, hooks);
  after = await readState(workspace);
  assert.deepEqual(dispatched.map((entry) => entry.actor), ['planning-manager', 'execution-manager', 'shell-agent', 'evidence-agent']);
  assert.deepEqual(after.pendingCapabilityHands, ['shell-agent', 'code-agent']);
  assert.equal(after.activeDispatch?.actor, 'shell-agent');

  await completeActiveDispatch(workspace, hooks);
  after = await readState(workspace);
  assert.deepEqual(dispatched.map((entry) => entry.actor), ['planning-manager', 'execution-manager', 'shell-agent', 'evidence-agent', 'code-agent']);
  assert.deepEqual(after.pendingCapabilityHands, ['code-agent']);
  assert.equal(after.activeDispatch?.actor, 'code-agent');

  const debug = await readFile(path.join(workspace, '.agent-memory', 'harness-plugin-debug.log'), 'utf8');
  assert.match(debug, /deferred\.hand\.dispatch\.requested/);

  await rm(workspace, { recursive: true, force: true });
});

test('single /control reaches execution-manager and the first hand for P-H1 only after upstream completions', async () => {
  const { workspace, hooks, dispatched } = await setupHarness('为现有系统搭建一个完整产品级功能，覆盖关键用户旅程与发布质量');

  await completeActiveDispatch(workspace, hooks);
  await completeActiveDispatch(workspace, hooks);
  await completeActiveDispatch(workspace, hooks);

  const after = await readState(workspace);
  assert.deepEqual(dispatched.map((entry) => entry.actor), ['feature-planner', 'planning-manager', 'execution-manager', 'docs-agent', 'browser-agent']);
  assert.ok(after.dispatchedCapabilityHands.includes('docs-agent'));
  assert.ok(after.dispatchedCapabilityHands.includes('browser-agent'));
  assert.deepEqual(after.pendingCapabilityHands, ['docs-agent', 'browser-agent', 'code-agent', 'shell-agent', 'evidence-agent']);
  assert.deepEqual(new Set(after.activeStepIds), new Set(['capability-hand:docs-agent', 'capability-hand:browser-agent']));
  assert.equal(after.activeDispatch?.actor, 'browser-agent');

  await rm(workspace, { recursive: true, force: true });
});
