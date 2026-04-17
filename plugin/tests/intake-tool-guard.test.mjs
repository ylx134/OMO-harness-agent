import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { server } from '../dist/index.js';

async function setupIntake(commandText = '修复构建报错并补上回归验证') {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-tool-guard-'));
  const hooks = await server({
    directory: workspace,
    client: { session: { promptAsync: async () => {} } },
    worktree: '/',
    serverUrl: new URL('http://127.0.0.1:4115/'),
  });

  await hooks['command.execute.before'](
    { command: 'control', arguments: commandText, sessionID: 'ses_test' },
    { parts: [] },
  );

  return { workspace, hooks };
}

test('tool.execute.before blocks top-level harness-orchestrator tool calls during intake', async () => {
  const { workspace, hooks } = await setupIntake();

  await assert.rejects(
    () => hooks['tool.execute.before'](
      { tool: 'read' },
      { args: { path: '/tmp/example.txt', agent: 'harness-orchestrator' } },
    ),
    /intake is already initialized; top-level harness-orchestrator must not continue tool work/,
  );

  const debug = await readFile(path.join(workspace, '.agent-memory', 'harness-plugin-debug.log'), 'utf8');
  assert.match(debug, /tool\.blocked\.during_intake/);

  await rm(workspace, { recursive: true, force: true });
});
