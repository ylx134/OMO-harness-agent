import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { server } from '../dist/index.js';

async function setupHarness(commandText) {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-semantic-lock-'));
  const hooks = await server({
    directory: workspace,
    client: {
      session: {
        promptAsync: async () => {},
      },
    },
    worktree: '/',
    serverUrl: new URL('http://127.0.0.1:4127/'),
  });

  await hooks['command.execute.before'](
    { command: 'control', arguments: commandText, sessionID: 'ses_test' },
    { parts: [] },
  );

  const state = JSON.parse(
    await readFile(path.join(workspace, '.agent-memory', 'harness-plugin-state.json'), 'utf8'),
  );
  const routePacket = JSON.parse(
    await readFile(path.join(workspace, '.agent-memory', 'route-packet.json'), 'utf8'),
  );
  const status = await readFile(path.join(workspace, '.agent-memory', 'orchestration-status.md'), 'utf8');
  const task = await readFile(path.join(workspace, '.agent-memory', 'task.md'), 'utf8');

  return { workspace, state, routePacket, status, task };
}

test('ambiguous /control intake enters semantic-lock clarification state instead of silently routing onward', async () => {
  const { workspace, state, routePacket, status, task } = await setupHarness('看一下这个');

  assert.equal(state.blocked, true);
  assert.equal(state.currentPhase, 'blocked');
  assert.equal(state.nextExpectedActor, 'none');
  assert.equal(state.semanticLockStatus, 'needs_clarification');
  assert.match(state.semanticLockText || '', /clarif|ambigu|明确|澄清/i);
  assert.equal(routePacket.semanticLockStatus, 'needs_clarification');
  assert.match(status, /Blocked: true/);
  assert.match(status, /Semantic Lock Status: needs_clarification/);
  assert.doesNotMatch(task, /\{What the user truly means by success/);
  assert.match(task, /## Semantic Lock/);

  await rm(workspace, { recursive: true, force: true });
});

test('intake bootstraps root memory helpers and writes populated task semantics', async () => {
  const { workspace, task } = await setupHarness('修复构建报错并补上回归验证');

  const initScript = await readFile(path.join(workspace, 'init.sh'), 'utf8');
  const progressLog = await readFile(path.join(workspace, 'claude-progress.txt'), 'utf8');

  assert.match(initScript, /Customize init\.sh|Auto-generated/);
  assert.match(progressLog, /=== Session 1/);
  assert.match(task, /## Final Goal/);
  assert.match(task, /## Semantic Lock/);
  assert.match(task, /## What Counts As Done/);
  assert.match(task, /## Non-Degradable Requirements Summary/);
  assert.match(task, /default mode may auto-dispatch the first legal actor after intake/i);
  assert.doesNotMatch(task, /No manager, hand, or probe progression happens here/);
  assert.doesNotMatch(task, /\{Describe the final goal in one sentence\}/);
  assert.doesNotMatch(task, /\{What the user truly means by success/);

  await rm(workspace, { recursive: true, force: true });
});
