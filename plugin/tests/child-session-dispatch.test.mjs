import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { server } from '../dist/index.js';

async function setupHarness() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-child-session-'));
  const createdSessions = [];
  const promptedSessions = [];
  const hooks = await server({
    directory: workspace,
    client: {
      session: {
        create: async (payload) => {
          createdSessions.push(payload);
          return { data: { id: `child_${createdSessions.length}` } };
        },
        promptAsync: async (payload) => {
          promptedSessions.push(payload);
        },
      },
    },
    worktree: '/',
    serverUrl: new URL('http://127.0.0.1:4123/'),
  });

  await hooks['command.execute.before'](
    { command: 'control', arguments: '修复构建报错并补上回归验证 --manual', sessionID: 'parent_ses' },
    { parts: [] },
  );

  return { workspace, hooks, createdSessions, promptedSessions };
}

test('deferred manager dispatch uses child sessions instead of parent session for actor prompts', async () => {
  const { workspace, hooks, createdSessions, promptedSessions } = await setupHarness();

  await hooks['command.execute.before'](
    { command: 'plan', arguments: '继续推进当前 Harness 路由', sessionID: 'parent_ses' },
    { parts: [] },
  );

  assert.equal(createdSessions.length, 1);
  assert.equal(promptedSessions.length, 1);
  assert.equal(promptedSessions[0].path.id, 'child_1');
  assert.notEqual(promptedSessions[0].path.id, 'parent_ses');
  assert.equal(createdSessions[0].body.parentID, 'parent_ses');
  assert.ok(!('agent' in promptedSessions[0].body), 'child prompt should not depend on a host-defined custom agent name');

  const state = JSON.parse(await readFile(path.join(workspace, '.agent-memory', 'harness-plugin-state.json'), 'utf8'));
  assert.equal(state.dispatchedManagers[0], 'planning-manager');
  assert.equal(state.childDispatchSessionIDs?.planning?.[0], 'child_1');

  await rm(workspace, { recursive: true, force: true });
});
