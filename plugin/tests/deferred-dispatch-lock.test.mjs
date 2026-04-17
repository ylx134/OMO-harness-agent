import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { server } from '../dist/index.js';

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
          dispatched.push(payload.body.agent);
          await gate.promise;
        },
      },
    },
    worktree: '/',
    serverUrl: new URL('http://127.0.0.1:4123/'),
  });

  await hooks['command.execute.before'](
    { command: 'control', arguments: '修复构建报错并补上回归验证', sessionID: 'ses_test' },
    { parts: [] },
  );

  return { workspace, hooks, gate, dispatched };
}

async function readState(workspace) {
  return JSON.parse(await readFile(path.join(workspace, '.agent-memory', 'harness-plugin-state.json'), 'utf8'));
}

test('duplicate plan command does not launch a second manager dispatch while first is still in flight', async () => {
  const { workspace, hooks, gate, dispatched } = await setupHarnessWithBlockingDispatch();

  const first = hooks['command.execute.before'](
    { command: 'plan', arguments: '继续推进当前 Harness 路由', sessionID: 'ses_test' },
    { parts: [] },
  );

  // allow first dispatch to set lock before second attempt
  await new Promise((resolve) => setTimeout(resolve, 10));

  await hooks['command.execute.before'](
    { command: 'plan', arguments: '继续推进当前 Harness 路由', sessionID: 'ses_test' },
    { parts: [] },
  );

  gate.resolve();
  await first

  const after = await readState(workspace);
  assert.deepEqual(dispatched, ['planning-manager']);
  assert.equal(after.activeDispatch, null);

  const debug = await readFile(path.join(workspace, '.agent-memory', 'harness-plugin-debug.log'), 'utf8');
  assert.match(debug, /deferred\.dispatch\.duplicate_skipped/);

  await rm(workspace, { recursive: true, force: true });
});
