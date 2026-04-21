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

async function setupWorkspace() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-reconcile-serial-compat-'));
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
    serverUrl: new URL('http://127.0.0.1:4125/'),
  });

  return { workspace, hooks, dispatched };
}

async function readState(workspace) {
  return JSON.parse(await readFile(path.join(workspace, '.agent-memory', 'harness-plugin-state.json'), 'utf8'));
}

async function emitCompletion(hooks, agent, sessionID, text = `${agent} finished real work`) {
  await hooks['chat.message'](
    { agent, sessionID },
    { parts: [{ type: 'text', text }] },
  );
}

test('reconcile preserves manager order while recording concurrent hand fan-out', async () => {
  const { workspace, hooks, dispatched } = await setupWorkspace();

  await hooks['command.execute.before'](
    { command: 'control', arguments: '修复构建报错并补上回归验证', sessionID: 'parent_ses' },
    { parts: [] },
  );

  let state = await readState(workspace);
  assert.deepEqual(dispatched.map((entry) => entry.actor), ['planning-manager']);
  assert.equal(state.activeDispatch?.actor, 'planning-manager');

  await emitCompletion(hooks, 'planning-manager', state.activeDispatch.sessionID);

  state = await readState(workspace);
  assert.deepEqual(dispatched.map((entry) => entry.actor), ['planning-manager', 'execution-manager']);
  assert.equal(state.activeDispatch?.actor, 'execution-manager');

  await emitCompletion(hooks, 'execution-manager', state.activeDispatch.sessionID);

  state = await readState(workspace);
  assert.deepEqual(dispatched.map((entry) => entry.actor), ['planning-manager', 'execution-manager', 'shell-agent', 'evidence-agent']);
  assert.deepEqual(new Set(state.activeStepIds), new Set(['capability-hand:shell-agent', 'capability-hand:evidence-agent']));
  assert.equal(state.activeDispatch?.actor, 'evidence-agent');

  const debug = await readFile(path.join(workspace, '.agent-memory', 'harness-plugin-debug.log'), 'utf8');
  assert.match(debug, /reconcile\.runtime\.started/);
  assert.match(debug, /reconcile\.runtime\.completed/);
  assert.match(debug, /source":"command\.execute\.before/);
  assert.match(debug, /source":"chat\.message/);

  await rm(workspace, { recursive: true, force: true });
});
