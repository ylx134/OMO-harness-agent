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

async function setupReviewState() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-review-guard-'));
  let childCount = 0;
  const prompts = [];
  const hooks = await server({
    directory: workspace,
    client: { session: {
      create: async () => ({ data: { id: `review_child_${++childCount}` } }),
      promptAsync: async (body) => {
        prompts.push(body);
      },
    } },
    worktree: '/',
    serverUrl: new URL('http://127.0.0.1:4117/'),
  });

  await hooks['command.execute.before'](
    { command: 'control', arguments: '帮我做一次代码 review，看看这些改动有没有问题', sessionID: 'ses_review' },
    { parts: [] },
  );

  return { workspace, hooks, prompts };
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

test('/control code review dispatches acceptance-manager instead of allowing top-level review work', async () => {
  const { workspace, hooks, prompts } = await setupReviewState();
  const state = JSON.parse(await readFile(path.join(workspace, '.agent-memory', 'harness-plugin-state.json'), 'utf8'));

  assert.equal(state.routeId, 'J-L1');
  assert.equal(state.activeDispatch?.actor, 'acceptance-manager');
  assert.ok(prompts.some((body) => JSON.stringify(body).includes('acceptance-manager')));

  await assert.rejects(
    () => hooks['tool.execute.before'](
      { tool: 'read', sessionID: 'ses_review' },
      { args: { path: '/tmp/example.txt' } },
    ),
    /top-level harness-orchestrator must not continue tool work while the deferred route is active/,
  );

  await rm(workspace, { recursive: true, force: true });
});

test('unknown default agent cannot use tools while a harness route is active', async () => {
  const { workspace, hooks } = await setupPlanningState();

  await assert.rejects(
    () => hooks['tool.execute.before'](
      { tool: 'read', agent: 'default-agent' },
      { args: { path: '/tmp/example.txt' } },
    ),
    /active harness routes only allow the top-level orchestrator or live dispatched child actors to use tools/,
  );

  const debug = await readFile(path.join(workspace, '.agent-memory', 'harness-plugin-debug.log'), 'utf8');
  assert.match(debug, /tool\.blocked\.unknown_actor_while_route_active/);

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

test('execution-manager guard reads tool args from hookInput when output args are absent', async () => {
  const { workspace, hooks } = await setupPlanningState();
  let state = JSON.parse(await readFile(path.join(workspace, '.agent-memory', 'harness-plugin-state.json'), 'utf8'));

  await hooks['chat.message'](
    { agent: 'planning-manager', sessionID: state.activeDispatch.sessionID },
    { parts: [{ type: 'text', text: 'planning manager finished the route contract' }] },
  );

  state = JSON.parse(await readFile(path.join(workspace, '.agent-memory', 'harness-plugin-state.json'), 'utf8'));
  assert.equal(state.activeDispatch?.actor, 'execution-manager');

  await assert.rejects(
    () => hooks['tool.execute.before'](
      {
        tool: 'task',
        agent: 'execution-manager',
        sessionID: state.activeDispatch.sessionID,
        args: { subagent_type: 'planning-manager', prompt: 'recurse into planning-manager' },
      },
      {},
    ),
    /Execution-manager must dispatch capability agents/,
  );

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
    /only a live deferred child actor may continue tool work/,
  );

  await rm(workspace, { recursive: true, force: true });
});
