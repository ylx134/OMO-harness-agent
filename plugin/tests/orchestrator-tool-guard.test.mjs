import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { server } from '../dist/index.js';

async function setupPlanningState() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-orchestrator-guard-'));
  let childCount = 0;
  const hooks = await server({
    directory: workspace,
    client: { session: {
      create: async () => ({ data: { id: `child_${++childCount}` } }),
      promptAsync: async () => {},
    } },
    worktree: '/',
    serverUrl: new URL('http://127.0.0.1:4117/'),
  });

  await hooks['command.execute.before'](
    { command: 'control', arguments: '修复构建报错并补上回归验证', sessionID: 'ses_test' },
    { parts: [] },
  );

  return { workspace, hooks };
}

test('top-level harness-orchestrator tool calls stay blocked after deferred manager progression starts', async () => {
  const { workspace, hooks } = await setupPlanningState();

  await assert.rejects(
    () => hooks['tool.execute.before'](
      { tool: 'read' },
      { args: { path: '/tmp/example.txt', agent: 'harness-orchestrator' } },
    ),
    /top-level harness-orchestrator must not continue tool work while the deferred route is active/,
  );

  const debug = await readFile(path.join(workspace, '.agent-memory', 'harness-plugin-debug.log'), 'utf8');
  assert.match(debug, /tool\.blocked\.while_deferred_route_active/);

  await rm(workspace, { recursive: true, force: true });
});

test('child manager tool calls are not mistaken for top-level harness-orchestrator work during an active route', async () => {
  const { workspace, hooks } = await setupPlanningState();

  await hooks['tool.execute.before'](
    { tool: 'read', agent: 'planning-manager' },
    { args: { path: '/tmp/example.txt' } },
  );

  const debug = await readFile(path.join(workspace, '.agent-memory', 'harness-plugin-debug.log'), 'utf8');
  assert.doesNotMatch(debug, /tool\.blocked\.while_deferred_route_active/);

  await rm(workspace, { recursive: true, force: true });
});

test('child manager tool calls can also be identified by child session id when agent is absent', async () => {
  const { workspace, hooks } = await setupPlanningState();
  const state = JSON.parse(await readFile(path.join(workspace, '.agent-memory', 'harness-plugin-state.json'), 'utf8'));

  await hooks['tool.execute.before'](
    { tool: 'skill', sessionID: state.childDispatchSessionIDs?.planning?.[0] },
    { args: { name: 'plan' } },
  );

  const debug = await readFile(path.join(workspace, '.agent-memory', 'harness-plugin-debug.log'), 'utf8');
  assert.doesNotMatch(debug, /tool\.blocked\.while_deferred_route_active/);

  await rm(workspace, { recursive: true, force: true });
});

test('completed child managers cannot keep using tools after the route moves on to another actor', async () => {
  const { workspace, hooks } = await setupPlanningState();
  let state = JSON.parse(await readFile(path.join(workspace, '.agent-memory', 'harness-plugin-state.json'), 'utf8'));

  await hooks['chat.message'](
    { agent: 'planning-manager', sessionID: state.activeDispatch.sessionID },
    { parts: [{ type: 'text', text: 'planning manager finished the route contract' }] },
  );

  state = JSON.parse(await readFile(path.join(workspace, '.agent-memory', 'harness-plugin-state.json'), 'utf8'));
  await assert.rejects(
    () => hooks['tool.execute.before'](
      { tool: 'read', agent: 'planning-manager', sessionID: state.childDispatchSessionIDs?.planning?.[0] },
      { args: { path: '/tmp/example.txt' } },
    ),
    /only the currently active deferred child actor may continue tool work/,
  );

  await rm(workspace, { recursive: true, force: true });
});
