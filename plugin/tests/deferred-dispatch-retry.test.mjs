import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { server } from '../dist/index.js';

async function createHooks({ failAgents = new Set(), commandText = '修复构建报错并补上回归验证' } = {}) {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-retry-'));
  const dispatched = [];
  const hooks = await server({
    directory: workspace,
    client: {
      session: {
        promptAsync: async (payload) => {
          const agent = payload.body.agent;
          dispatched.push(agent);
          if (failAgents.has(agent)) {
            throw new Error(`simulated prompt_async failure for ${agent}`);
          }
        },
      },
    },
    worktree: '/',
    serverUrl: new URL('http://127.0.0.1:4118/'),
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

test('failed deferred manager dispatch keeps queue stable and records retryable error', async () => {
  const { workspace, hooks, dispatched } = await createHooks({ failAgents: new Set(['planning-manager']) });

  await hooks['command.execute.before'](
    { command: 'plan', arguments: '继续推进当前 Harness 路由', sessionID: 'ses_test' },
    { parts: [] },
  );

  const after = await readState(workspace);
  assert.deepEqual(dispatched, ['planning-manager']);
  assert.deepEqual(after.dispatchedManagers, []);
  assert.deepEqual(after.pendingManagers, ['planning-manager', 'execution-manager', 'acceptance-manager']);
  assert.equal(after.currentPhase, 'intake');
  assert.equal(after.nextExpectedActor, 'planning-manager');
  assert.equal(after.deferredDispatchState, 'retryable_error');
  assert.equal(after.lastDispatchError?.actor, 'planning-manager');
  assert.match(after.lastDispatchError?.message || '', /simulated prompt_async failure/);

  const debug = await readFile(path.join(workspace, '.agent-memory', 'harness-plugin-debug.log'), 'utf8');
  assert.match(debug, /deferred\.dispatch\.error/);

  await rm(workspace, { recursive: true, force: true });
});

test('retry after deferred manager dispatch failure can succeed without corrupting queues', async () => {
  const failAgents = new Set(['planning-manager']);
  const { workspace, hooks, dispatched } = await createHooks({ failAgents });

  await hooks['command.execute.before'](
    { command: 'plan', arguments: '继续推进当前 Harness 路由', sessionID: 'ses_test' },
    { parts: [] },
  );

  failAgents.delete('planning-manager');

  await hooks['command.execute.before'](
    { command: 'plan', arguments: '继续推进当前 Harness 路由', sessionID: 'ses_test' },
    { parts: [] },
  );

  const after = await readState(workspace);
  assert.deepEqual(dispatched, ['planning-manager', 'planning-manager']);
  assert.deepEqual(after.dispatchedManagers, ['planning-manager']);
  assert.deepEqual(after.pendingManagers, ['execution-manager', 'acceptance-manager']);
  assert.equal(after.currentPhase, 'planning');
  assert.equal(after.nextExpectedActor, 'execution-manager');
  assert.equal(after.deferredDispatchState, 'manager_in_progress');
  assert.equal(after.lastCompletedActor, 'planning-manager');
  assert.equal(after.lastDispatchError, null);

  await rm(workspace, { recursive: true, force: true });
});

test('failed deferred probe dispatch preserves pending probes for later retry', async () => {
  const failAgents = new Set(['regression-probe-agent']);
  const { workspace, hooks, dispatched } = await createHooks({ failAgents });

  const sequence = [
    'plan',
    'drive',
    'drive',
    'drive',
    'drive',
    'check',
    'check',
  ];

  for (const command of sequence) {
    await hooks['command.execute.before'](
      { command, arguments: '继续推进当前 Harness 路由', sessionID: 'ses_test' },
      { parts: [] },
    );
  }

  const after = await readState(workspace);
  assert.ok(dispatched.includes('regression-probe-agent'));
  assert.deepEqual(after.dispatchedProbes, []);
  assert.deepEqual(after.pendingProbes, ['regression-probe-agent', 'artifact-probe-agent']);
  assert.equal(after.deferredDispatchState, 'retryable_error');
  assert.equal(after.lastDispatchError?.actor, 'regression-probe-agent');
  assert.equal(after.nextExpectedActor, 'regression-probe-agent');

  await rm(workspace, { recursive: true, force: true });
});
