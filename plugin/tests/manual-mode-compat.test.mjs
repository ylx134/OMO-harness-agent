import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
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

async function completeActiveDispatch(workspace, hooks) {
  const state = await readState(workspace);
  await hooks['chat.message'](
    { agent: state.activeDispatch.actor, sessionID: state.activeDispatch.sessionID },
    { parts: [{ type: 'text', text: `${state.activeDispatch.actor} finished real work` }] },
  );
}

test('--manual keeps the graph runtime in serial compatibility mode and avoids hand fan-out', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-manual-compat-'));
  await mkdir(path.join(workspace, '.agent-memory'), { recursive: true });

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
    serverUrl: new URL('http://127.0.0.1:4131/'),
  });

  await hooks['command.execute.before'](
    { command: 'control', arguments: '--manual 修复构建报错并补上回归验证', sessionID: 'manual_parent' },
    { parts: [] },
  );

  let state = await readState(workspace);
  assert.equal(state.autopilotEnabled, false);
  assert.equal(state.graphRuntimeRollout?.mode, 'serial-compat');
  assert.deepEqual(state.graphRuntimeRollout?.budgets, { managers: 1, hands: 1, probes: 1 });
  assert.deepEqual(dispatched, []);

  await hooks['command.execute.before'](
    { command: 'plan', arguments: '', sessionID: 'manual_parent' },
    { parts: [] },
  );
  assert.deepEqual(dispatched.map((entry) => entry.actor), ['planning-manager']);

  await completeActiveDispatch(workspace, hooks);

  await hooks['command.execute.before'](
    { command: 'drive', arguments: '', sessionID: 'manual_parent' },
    { parts: [] },
  );
  assert.deepEqual(dispatched.map((entry) => entry.actor), ['planning-manager', 'execution-manager']);

  await completeActiveDispatch(workspace, hooks);

  await hooks['command.execute.before'](
    { command: 'drive', arguments: '', sessionID: 'manual_parent' },
    { parts: [] },
  );

  state = await readState(workspace);
  assert.deepEqual(dispatched.map((entry) => entry.actor), ['planning-manager', 'execution-manager', 'shell-agent']);
  assert.deepEqual(state.activeStepIds, ['capability-hand:shell-agent']);
  assert.equal(state.activeDispatch?.actor, 'shell-agent');

  await rm(workspace, { recursive: true, force: true });
});
