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
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-concurrent-hand-'));
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

test('non-conflicting capability hands can launch together after managers still progress sequentially', async () => {
  const { workspace, hooks, dispatched } = await setupHarness('为现有系统搭建一个完整产品级功能，覆盖关键用户旅程与发布质量');

  await completeActiveDispatch(workspace, hooks);
  let state = await readState(workspace);
  assert.deepEqual(dispatched.map((entry) => entry.actor), ['feature-planner', 'planning-manager']);
  assert.deepEqual(state.activeStepIds, ['manager:planning-manager']);

  await completeActiveDispatch(workspace, hooks);
  state = await readState(workspace);
  assert.deepEqual(dispatched.map((entry) => entry.actor), ['feature-planner', 'planning-manager', 'execution-manager']);
  assert.deepEqual(state.activeStepIds, ['manager:execution-manager']);

  await completeActiveDispatch(workspace, hooks);
  state = await readState(workspace);

  assert.deepEqual(dispatched.map((entry) => entry.actor), ['feature-planner', 'planning-manager', 'execution-manager', 'docs-agent', 'browser-agent']);
  assert.deepEqual(new Set(state.activeStepIds), new Set(['capability-hand:docs-agent', 'capability-hand:browser-agent']));
  assert.equal(state.heldLocks['docs-write'], 'capability-hand:docs-agent');

  await rm(workspace, { recursive: true, force: true });
});
