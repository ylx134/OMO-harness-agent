import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { server } from '../dist/index.js';

async function setupHarness() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-standard-signals-'));
  let childCount = 0;
  const hooks = await server({
    directory: workspace,
    client: {
      session: {
        create: async () => ({ data: { id: `child_${++childCount}` } }),
        promptAsync: async () => {},
      },
    },
    worktree: '/',
    serverUrl: new URL('http://127.0.0.1:4128/'),
  });

  await hooks['command.execute.before'](
    { command: 'control', arguments: '修复构建报错并补上回归验证', sessionID: 'parent_ses' },
    { parts: [] },
  );

  return { workspace, hooks };
}

async function readState(workspace) {
  return JSON.parse(await readFile(path.join(workspace, '.agent-memory', 'harness-plugin-state.json'), 'utf8'));
}

test('progress and handoff signals are recorded without completing a live child step until HARNESS_COMPLETE appears', async () => {
  const { workspace, hooks } = await setupHarness();
  let state = await readState(workspace);
  assert.equal(state.activeDispatch?.actor, 'planning-manager');

  await hooks['chat.message'](
    { agent: 'planning-manager', sessionID: state.activeDispatch.sessionID },
    {
      parts: [{ type: 'text', text: [
        'HARNESS_PROGRESS {"status":"working","summary":"reading route packet","nextActions":["draft contract"]}',
        'HARNESS_HANDOFF {"to":"execution-manager","summary":"contract shape emerging","artifacts":[".agent-memory/task.md"],"blockers":[],"nextActions":["finish contract"]}',
      ].join('\n') }],
    },
  );

  state = await readState(workspace);
  assert.equal(state.activeDispatch?.actor, 'planning-manager');
  assert.equal(state.stepRuntime['manager:planning-manager'].status, 'in_progress');
  assert.equal(state.progressSignals.length, 1);
  assert.equal(state.handoffSignals.length, 1);

  const progressLog = await readFile(path.join(workspace, '.agent-memory', 'progress-events.jsonl'), 'utf8');
  const handoffLog = await readFile(path.join(workspace, '.agent-memory', 'handoff-events.jsonl'), 'utf8');
  assert.match(progressLog, /reading route packet/);
  assert.match(handoffLog, /contract shape emerging/);

  await hooks['chat.message'](
    { agent: 'planning-manager', sessionID: state.activeDispatch.sessionID },
    {
      parts: [{ type: 'text', text: [
        'HARNESS_HANDOFF {"to":"execution-manager","summary":"contract ready","artifacts":[".agent-memory/round-contract.md"],"blockers":[],"nextActions":["execute"]}',
        'HARNESS_COMPLETE {"status":"done","summary":"planning manager completed contract"}',
      ].join('\n') }],
    },
  );

  state = await readState(workspace);
  assert.equal(state.stepRuntime['manager:planning-manager'].status, 'succeeded');
  assert.equal(state.activeDispatch?.actor, 'execution-manager');
  assert.equal(state.completionSignals.length, 1);

  await rm(workspace, { recursive: true, force: true });
});
