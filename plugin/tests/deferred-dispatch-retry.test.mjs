import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { server } from '../dist/index.js';

function inferActorFromPrompt(text = '') {
  const match = text.match(/Harness plugin as ([^.\n]+)/);
  return match?.[1] || undefined;
}

async function createHooks({ failAgents = new Set(), commandText = '修复构建报错并补上回归验证' } = {}) {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-retry-'));
  const dispatched = [];
  const hooks = await server({
    directory: workspace,
    client: {
      session: {
        promptAsync: async (payload) => {
          const agent = inferActorFromPrompt(payload.body.parts?.[0]?.text || '');
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
    { command: 'control', arguments: `${commandText} --manual`, sessionID: 'ses_test' },
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
  assert.deepEqual(after.pendingManagers, ['planning-manager', 'execution-manager', 'acceptance-manager']);
  assert.equal(after.currentPhase, 'planning');
  assert.equal(after.nextExpectedActor, 'planning-manager');
  assert.equal(after.deferredDispatchState, 'manager_in_progress');
  assert.equal(after.lastCompletedActor, 'none');
  assert.equal(after.lastDispatchError, null);
  assert.equal(after.activeDispatch?.actor, 'planning-manager');

  await rm(workspace, { recursive: true, force: true });
});

test('failed deferred probe dispatch preserves pending probes for later retry', async () => {
  const failAgents = new Set(['regression-probe-agent']);
  const { workspace, hooks, dispatched } = await createHooks({ failAgents });

  await hooks['command.execute.before'](
    { command: 'plan', arguments: '继续推进当前 Harness 路由', sessionID: 'ses_test' },
    { parts: [] },
  );
  await completeActiveDispatch(workspace, hooks);

  const executionCommands = ['drive', 'drive', 'drive', 'drive'];
  for (const command of executionCommands) {
    await hooks['command.execute.before'](
      { command, arguments: '继续推进当前 Harness 路由', sessionID: 'ses_test' },
      { parts: [] },
    );
    await completeActiveDispatch(workspace, hooks);
  }

  await hooks['command.execute.before'](
    { command: 'check', arguments: '继续推进当前 Harness 路由', sessionID: 'ses_test' },
    { parts: [] },
  );
  await completeActiveDispatch(workspace, hooks);

  await hooks['command.execute.before'](
    { command: 'check', arguments: '继续推进当前 Harness 路由', sessionID: 'ses_test' },
    { parts: [] },
  );

  const after = await readState(workspace);
  assert.ok(dispatched.includes('regression-probe-agent'));
  assert.deepEqual(after.dispatchedProbes, []);
  assert.deepEqual(after.pendingProbes, ['regression-probe-agent', 'artifact-probe-agent']);
  assert.equal(after.deferredDispatchState, 'retryable_error');
  assert.equal(after.lastDispatchError?.actor, 'regression-probe-agent');
  assert.equal(after.nextExpectedActor, 'regression-probe-agent');

  await rm(workspace, { recursive: true, force: true });
});
