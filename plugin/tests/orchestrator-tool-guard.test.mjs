import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { server } from '../dist/index.js';

async function setupPlanningState() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-orchestrator-guard-'));
  const hooks = await server({
    directory: workspace,
    client: { session: { promptAsync: async () => {} } },
    worktree: '/',
    serverUrl: new URL('http://127.0.0.1:4117/'),
  });

  await hooks['command.execute.before'](
    { command: 'control', arguments: '修复构建报错并补上回归验证', sessionID: 'ses_test' },
    { parts: [] },
  );
  await hooks['command.execute.before'](
    { command: 'plan', arguments: '继续推进当前 Harness 路由', sessionID: 'ses_test' },
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
