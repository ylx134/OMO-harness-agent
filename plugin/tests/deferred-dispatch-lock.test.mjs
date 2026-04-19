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

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function setupHarnessWithBlockingDispatch() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-dispatch-lock-'));
  const gate = deferred();
  const dispatched = [];
  const hooks = await server({
    directory: workspace,
    client: {
      session: {
        promptAsync: async (payload) => {
          dispatched.push(inferActorFromPrompt(payload.body.parts?.[0]?.text || ''));
          await gate.promise;
        },
      },
    },
    worktree: '/',
    serverUrl: new URL('http://127.0.0.1:4123/'),
  });

  const first = hooks['command.execute.before'](
    { command: 'control', arguments: '修复构建报错并补上回归验证', sessionID: 'ses_test' },
    { parts: [] },
  );

  await new Promise((resolve) => setTimeout(resolve, 10));

  return { workspace, hooks, gate, dispatched, first };
}

async function readState(workspace) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      return JSON.parse(await readFile(path.join(workspace, '.agent-memory', 'harness-plugin-state.json'), 'utf8'));
    } catch (error) {
      if (error instanceof SyntaxError) {
        await new Promise((resolve) => setTimeout(resolve, 5));
        continue;
      }
      throw error;
    }
  }
  return JSON.parse(await readFile(path.join(workspace, '.agent-memory', 'harness-plugin-state.json'), 'utf8'));
}

async function waitForActiveDispatch(workspace, actor, attempts = 50) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const state = await readState(workspace);
      if (state.activeDispatch?.actor === actor) {
        return state;
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timed out waiting for active dispatch: ${actor}`);
}

test('duplicate /control does not launch a second manager dispatch while the first autopilot dispatch is still in flight', async () => {
  const { workspace, hooks, gate, dispatched, first } = await setupHarnessWithBlockingDispatch();

  await waitForActiveDispatch(workspace, 'planning-manager');

  await hooks['command.execute.before'](
    { command: 'control', arguments: '继续推进当前 Harness 路由', sessionID: 'ses_test' },
    { parts: [] },
  );

  gate.resolve();
  await first;

  const after = await readState(workspace);
  assert.equal(dispatched[0], 'planning-manager');
  assert.equal(dispatched.filter((agent) => agent === 'planning-manager').length, 1);
  assert.equal(after.activeDispatch?.actor, 'planning-manager');
  assert.equal(after.deferredDispatchState, 'manager_in_progress');

  const debug = await readFile(path.join(workspace, '.agent-memory', 'harness-plugin-debug.log'), 'utf8');
  assert.match(debug, /deferred\.dispatch\.duplicate_skipped/);

  await rm(workspace, { recursive: true, force: true });
});
