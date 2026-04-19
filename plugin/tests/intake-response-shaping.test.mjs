import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { server } from '../dist/index.js';

async function setupIntake(commandText = '修复构建报错并补上回归验证') {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-intake-response-'));
  const hooks = await server({
    directory: workspace,
    client: { session: { promptAsync: async () => {} } },
    worktree: '/',
    serverUrl: new URL('http://127.0.0.1:4116/'),
  });

  await hooks['command.execute.before'](
    { command: 'control', arguments: `${commandText} --manual`, sessionID: 'ses_test' },
    { parts: [] },
  );

  return { workspace, hooks };
}

test('chat.message short-circuits harness-orchestrator into deterministic intake summary', async () => {
  const { workspace, hooks } = await setupIntake();
  const output = {
    parts: [
      { type: 'text', text: '[analyze-mode]\nANALYSIS MODE. Gather context before diving deep...' },
      { type: 'text', text: 'Some extra noisy content that should be replaced.' },
    ],
  };

  await hooks['chat.message'](
    { agent: 'harness-orchestrator' },
    output,
  );

  assert.deepEqual(output.parts, [
    {
      type: 'text',
      text: 'Harness intake initialized for F-M1. Next expected actor: planning-manager. Route packet written to .agent-memory/route-packet.json.',
    },
  ]);

  const debug = await readFile(path.join(workspace, '.agent-memory', 'harness-plugin-debug.log'), 'utf8');
  assert.match(debug, /hook\.chat\.message\.orchestrator_short_circuited/);
  assert.doesNotMatch(debug, /hook\.chat\.message\.orchestrator_ignored/);

  await rm(workspace, { recursive: true, force: true });
});

test('chat.message still short-circuits intake summary when the host agent is generic but the session belongs to the route owner', async () => {
  const { workspace, hooks } = await setupIntake();
  const output = {
    parts: [
      { type: 'text', text: 'Generic default-agent output that should be replaced.' },
    ],
  };

  await hooks['chat.message'](
    { agent: 'default-agent', sessionID: 'ses_test' },
    output,
  );

  assert.deepEqual(output.parts, [
    {
      type: 'text',
      text: 'Harness intake initialized for F-M1. Next expected actor: planning-manager. Route packet written to .agent-memory/route-packet.json.',
    },
  ]);

  await rm(workspace, { recursive: true, force: true });
});
