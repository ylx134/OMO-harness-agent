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
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-lock-conflict-'));
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
    serverUrl: new URL('http://127.0.0.1:4117/'),
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

test('granular locks allow non-conflicting capability hands to run concurrently while still tracking held resources', async () => {
  const { workspace, hooks, dispatched } = await setupHarness('修复构建报错并补上回归验证');

  await completeActiveDispatch(workspace, hooks);
  await completeActiveDispatch(workspace, hooks);

  const state = await readState(workspace);
  assert.deepEqual(dispatched.map((entry) => entry.actor), ['planning-manager', 'execution-manager', 'shell-agent', 'code-agent']);
  assert.deepEqual(new Set(state.activeStepIds), new Set(['capability-hand:shell-agent', 'capability-hand:code-agent']));
  assert.equal(state.heldLocks['build-runner'], 'capability-hand:shell-agent');
  assert.equal(state.heldLocks['workspace-setup'], 'capability-hand:shell-agent');
  assert.equal(state.heldLocks['source-edit'], 'capability-hand:code-agent');
  assert.ok(state.activeStepIds.includes('capability-hand:code-agent'));

  await rm(workspace, { recursive: true, force: true });
});
