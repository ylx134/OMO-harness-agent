import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { server } from '../dist/index.js';

async function setupHarness(commandText, extraPlanRuns = 0) {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-deferred-hand-'));
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
  await hooks['command.execute.before'](
    { command: 'plan', arguments: '继续推进当前 Harness 路由', sessionID: 'ses_test' },
    { parts: [] },
  );
  for (let i = 0; i < extraPlanRuns; i += 1) {
    await hooks['command.execute.before'](
      { command: 'plan', arguments: '继续推进当前 Harness 路由', sessionID: 'ses_test' },
      { parts: [] },
    );
  }

  return { workspace, hooks, dispatched };
}

async function readState(workspace) {
  return JSON.parse(await readFile(path.join(workspace, '.agent-memory', 'harness-plugin-state.json'), 'utf8'));
}

test('first drive command dispatches execution-manager before any capability hands', async () => {
  const { workspace, hooks, dispatched } = await setupHarness('修复构建报错并补上回归验证');

  await hooks['command.execute.before'](
    { command: 'drive', arguments: '继续推进当前 Harness 路由', sessionID: 'ses_test' },
    { parts: [] },
  );

  const after = await readState(workspace);
  assert.deepEqual(dispatched, ['planning-manager', 'execution-manager']);
  assert.deepEqual(after.dispatchedManagers, ['planning-manager', 'execution-manager']);
  assert.deepEqual(after.pendingManagers, ['acceptance-manager']);
  assert.deepEqual(after.dispatchedCapabilityHands, []);
  assert.deepEqual(after.pendingCapabilityHands, ['shell-agent', 'code-agent', 'evidence-agent']);
  assert.equal(after.currentPhase, 'execution');
  assert.equal(after.nextExpectedActor, 'shell-agent');
  assert.equal(after.lastCompletedActor, 'execution-manager');
  assert.equal(after.deferredDispatchState, 'manager_in_progress');

  await rm(workspace, { recursive: true, force: true });
});

test('second drive command dispatches the first capability hand after execution-manager', async () => {
  const { workspace, hooks, dispatched } = await setupHarness('修复构建报错并补上回归验证');

  await hooks['command.execute.before'](
    { command: 'drive', arguments: '继续推进当前 Harness 路由', sessionID: 'ses_test' },
    { parts: [] },
  );
  await hooks['command.execute.before'](
    { command: 'drive', arguments: '继续推进当前 Harness 路由', sessionID: 'ses_test' },
    { parts: [] },
  );

  const after = await readState(workspace);
  assert.deepEqual(dispatched, ['planning-manager', 'execution-manager', 'shell-agent']);
  assert.deepEqual(after.dispatchedCapabilityHands, ['shell-agent']);
  assert.deepEqual(after.pendingCapabilityHands, ['code-agent', 'evidence-agent']);
  assert.equal(after.currentPhase, 'execution');
  assert.equal(after.nextExpectedActor, 'code-agent');
  assert.equal(after.lastCompletedActor, 'shell-agent');
  assert.equal(after.deferredDispatchState, 'hand_in_progress');

  const debug = await readFile(path.join(workspace, '.agent-memory', 'harness-plugin-debug.log'), 'utf8');
  assert.match(debug, /deferred\.hand\.dispatch\.requested/);

  await rm(workspace, { recursive: true, force: true });
});

test('P-H1 requires both planner stages before drive dispatches execution-manager, then hands', async () => {
  const { workspace, hooks, dispatched } = await setupHarness('为现有系统搭建一个完整产品级功能，覆盖关键用户旅程与发布质量', 1);

  await hooks['command.execute.before'](
    { command: 'drive', arguments: '继续推进当前 Harness 路由', sessionID: 'ses_test' },
    { parts: [] },
  );
  await hooks['command.execute.before'](
    { command: 'drive', arguments: '继续推进当前 Harness 路由', sessionID: 'ses_test' },
    { parts: [] },
  );

  const after = await readState(workspace);
  assert.deepEqual(dispatched, ['feature-planner', 'planning-manager', 'execution-manager', 'docs-agent']);
  assert.ok(after.dispatchedCapabilityHands.includes('docs-agent'));
  assert.ok(after.pendingCapabilityHands.includes('browser-agent'));
  assert.equal(after.currentPhase, 'execution');

  await rm(workspace, { recursive: true, force: true });
});
