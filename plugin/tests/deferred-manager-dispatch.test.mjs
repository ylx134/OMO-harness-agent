import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { server } from '../dist/index.js';

async function setupHarness(commandText) {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-deferred-manager-'));
  const dispatched = [];
  const hooks = await server({
    directory: workspace,
    client: {
      session: {
        promptAsync: async (payload) => {
          dispatched.push(payload.body.agent);
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

test('plan command advances deferred manager queue by dispatching the next manager once', async () => {
  const { workspace, hooks, dispatched } = await setupHarness('修复构建报错并补上回归验证');
  const before = await readState(workspace);
  const requestId = before.requestId;

  await hooks['command.execute.before'](
    { command: 'plan', arguments: '继续推进当前 Harness 路由', sessionID: 'ses_test' },
    { parts: [] },
  );

  const after = await readState(workspace);
  assert.equal(after.requestId, requestId);
  assert.deepEqual(dispatched, ['planning-manager']);
  assert.deepEqual(after.dispatchedManagers, ['planning-manager']);
  assert.deepEqual(after.pendingManagers, ['execution-manager', 'acceptance-manager']);
  assert.equal(after.currentPhase, 'planning');
  assert.equal(after.nextExpectedActor, 'execution-manager');
  assert.equal(after.lastCompletedActor, 'planning-manager');
  assert.equal(after.deferredDispatchState, 'manager_in_progress');

  const debug = await readFile(path.join(workspace, '.agent-memory', 'harness-plugin-debug.log'), 'utf8');
  assert.match(debug, /deferred\.manager\.dispatch\.requested/);

  await rm(workspace, { recursive: true, force: true });
});

test('plan command on A-M1 dispatches specialized first manager from deferred queue', async () => {
  const { workspace, hooks, dispatched } = await setupHarness('把系统真正改造成具备更深层的隐藏能力，并证明 API 行为可靠');

  await hooks['command.execute.before'](
    { command: 'plan', arguments: '继续推进当前 Harness 路由', sessionID: 'ses_test' },
    { parts: [] },
  );

  const after = await readState(workspace);
  assert.deepEqual(dispatched, ['capability-planner']);
  assert.deepEqual(after.dispatchedManagers, ['capability-planner']);
  assert.deepEqual(after.pendingManagers, ['planning-manager', 'execution-manager', 'acceptance-manager']);
  assert.equal(after.currentPhase, 'planning');
  assert.equal(after.nextExpectedActor, 'planning-manager');

  await rm(workspace, { recursive: true, force: true });
});
