import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { server } from '../dist/index.js';

async function setupHarness(commandText, extraPlanRuns = 0, driveRuns = 0) {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-deferred-probe-'));
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
  for (let i = 0; i < driveRuns; i += 1) {
    await hooks['command.execute.before'](
      { command: 'drive', arguments: '继续推进当前 Harness 路由', sessionID: 'ses_test' },
      { parts: [] },
    );
  }

  return { workspace, hooks, dispatched };
}

async function readState(workspace) {
  return JSON.parse(await readFile(path.join(workspace, '.agent-memory', 'harness-plugin-state.json'), 'utf8'));
}

test('first check command dispatches acceptance-manager before probes', async () => {
  const { workspace, hooks, dispatched } = await setupHarness('修复构建报错并补上回归验证', 0, 4);

  await hooks['command.execute.before'](
    { command: 'check', arguments: '继续推进当前 Harness 路由', sessionID: 'ses_test' },
    { parts: [] },
  );

  const after = await readState(workspace);
  assert.deepEqual(dispatched, ['planning-manager', 'execution-manager', 'shell-agent', 'code-agent', 'evidence-agent', 'acceptance-manager']);
  assert.deepEqual(after.dispatchedManagers, ['planning-manager', 'execution-manager', 'acceptance-manager']);
  assert.deepEqual(after.pendingManagers, []);
  assert.equal(after.currentPhase, 'acceptance');
  assert.equal(after.nextExpectedActor, 'regression-probe-agent');
  assert.equal(after.lastCompletedActor, 'acceptance-manager');
  assert.equal(after.deferredDispatchState, 'manager_in_progress');

  await rm(workspace, { recursive: true, force: true });
});

test('subsequent check commands dispatch probes and then finalize acceptance', async () => {
  const { workspace, hooks, dispatched } = await setupHarness('修复构建报错并补上回归验证', 0, 4);

  await hooks['command.execute.before'](
    { command: 'check', arguments: '继续推进当前 Harness 路由', sessionID: 'ses_test' },
    { parts: [] },
  );
  await hooks['command.execute.before'](
    { command: 'check', arguments: '继续推进当前 Harness 路由', sessionID: 'ses_test' },
    { parts: [] },
  );
  await hooks['command.execute.before'](
    { command: 'check', arguments: '继续推进当前 Harness 路由', sessionID: 'ses_test' },
    { parts: [] },
  );
  await writeFile(path.join(workspace, '.agent-memory', 'round-contract.md'), '# Round Contract\nreal content\n');
  await writeFile(path.join(workspace, '.agent-memory', 'execution-status.md'), '# Execution Status\nreal content\n');
  await writeFile(path.join(workspace, '.agent-memory', 'evidence-ledger.md'), '# Evidence Ledger\nreal content\n');
  await writeFile(path.join(workspace, '.agent-memory', 'acceptance-report.md'), '# Acceptance Report\nreal content\n');
  await hooks['command.execute.before'](
    { command: 'check', arguments: '继续推进当前 Harness 路由', sessionID: 'ses_test' },
    { parts: [] },
  );

  const after = await readState(workspace);
  assert.deepEqual(dispatched, [
    'planning-manager',
    'execution-manager',
    'shell-agent',
    'code-agent',
    'evidence-agent',
    'acceptance-manager',
    'regression-probe-agent',
    'artifact-probe-agent',
    'acceptance-manager',
  ]);
  assert.deepEqual(after.dispatchedProbes, ['regression-probe-agent', 'artifact-probe-agent']);
  assert.deepEqual(after.pendingProbes, []);
  assert.equal(after.currentPhase, 'complete');
  assert.equal(after.nextExpectedActor, 'none');
  assert.equal(after.lastCompletedActor, 'acceptance-manager');
  assert.equal(after.deferredDispatchState, 'complete');

  const debug = await readFile(path.join(workspace, '.agent-memory', 'harness-plugin-debug.log'), 'utf8');
  assert.match(debug, /deferred\.probe\.dispatch\.requested/);
  assert.match(debug, /deferred\.acceptance\.closure\.requested/);

  await rm(workspace, { recursive: true, force: true });
});
