import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { server } from '../dist/index.js';

async function setupHarness(commandText, writeAllDeliverables = false) {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-deliverable-gate-'));
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
    serverUrl: new URL('http://127.0.0.1:4118/'),
  });

  await hooks['command.execute.before'](
    { command: 'control', arguments: commandText, sessionID: 'ses_test' },
    { parts: [] },
  );
  await hooks['command.execute.before'](
    { command: 'plan', arguments: '继续推进当前 Harness 路由', sessionID: 'ses_test' },
    { parts: [] },
  );
  await hooks['command.execute.before'](
    { command: 'drive', arguments: '继续推进当前 Harness 路由', sessionID: 'ses_test' },
    { parts: [] },
  );
  await hooks['command.execute.before'](
    { command: 'drive', arguments: '继续推进当前 Harness 路由', sessionID: 'ses_test' },
    { parts: [] },
  );
  await hooks['command.execute.before'](
    { command: 'drive', arguments: '继续推进当前 Harness 路由', sessionID: 'ses_test' },
    { parts: [] },
  );
  await hooks['command.execute.before'](
    { command: 'drive', arguments: '继续推进当前 Harness 路由', sessionID: 'ses_test' },
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
  await hooks['command.execute.before'](
    { command: 'check', arguments: '继续推进当前 Harness 路由', sessionID: 'ses_test' },
    { parts: [] },
  );

  if (writeAllDeliverables) {
    for (const name of ['round-contract.md', 'execution-status.md', 'evidence-ledger.md', 'acceptance-report.md']) {
      await writeFile(path.join(workspace, '.agent-memory', name), `# ${name}\nreal content\n`);
    }
  }

  return { workspace, hooks, dispatched };
}

async function readState(workspace) {
  return JSON.parse(await readFile(path.join(workspace, '.agent-memory', 'harness-plugin-state.json'), 'utf8'));
}

test('final acceptance closure does not mark complete while deliverables are still missing', async () => {
  const { workspace, hooks, dispatched } = await setupHarness('修复构建报错并补上回归验证', false);

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
  ]);
  assert.equal(after.currentPhase, 'acceptance');
  assert.equal(after.nextExpectedActor, 'acceptance-manager');
  assert.equal(after.deferredDispatchState, 'retryable_error');
  assert.equal(after.lastDispatchError?.actor, 'acceptance-manager');
  assert.match(after.lastDispatchError?.message || '', /missing deliverables/i);

  const routePacket = JSON.parse(await readFile(path.join(workspace, '.agent-memory', 'route-packet.json'), 'utf8'));
  assert.deepEqual(routePacket.missingDeliverables, [
    'round-contract.md',
    'execution-status.md',
    'evidence-ledger.md',
    'acceptance-report.md',
  ]);

  await rm(workspace, { recursive: true, force: true });
});

test('final acceptance closure can mark complete once deliverables are present', async () => {
  const { workspace, hooks, dispatched } = await setupHarness('修复构建报错并补上回归验证', true);

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
  assert.equal(after.currentPhase, 'complete');
  assert.equal(after.nextExpectedActor, 'none');
  assert.equal(after.deferredDispatchState, 'complete');

  const routePacket = JSON.parse(await readFile(path.join(workspace, '.agent-memory', 'route-packet.json'), 'utf8'));
  assert.deepEqual(routePacket.missingDeliverables, []);

  await rm(workspace, { recursive: true, force: true });
});
