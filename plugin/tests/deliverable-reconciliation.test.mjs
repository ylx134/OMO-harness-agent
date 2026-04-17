import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { server } from '../dist/index.js';

async function setupWorkspaceWithArtifacts() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-deliverables-'));
  await mkdir(path.join(workspace, '.agent-memory'), { recursive: true });
  await writeFile(path.join(workspace, '.agent-memory', 'round-contract.md'), '# Round Contract\n');
  await writeFile(path.join(workspace, '.agent-memory', 'execution-status.md'), '# Execution Status\n');
  await writeFile(path.join(workspace, '.agent-memory', 'evidence-ledger.md'), '# Evidence Ledger\n');
  return workspace;
}

async function initializeFRoute(workspace) {
  const hooks = await server({
    directory: workspace,
    client: { session: { promptAsync: async () => {} } },
    worktree: '/',
    serverUrl: new URL('http://127.0.0.1:4118/'),
  });

  await hooks['command.execute.before'](
    { command: 'control', arguments: '修复构建报错并补上回归验证', sessionID: 'ses_test' },
    { parts: [] },
  );

  return hooks;
}

test('route-packet missingDeliverables shrinks when expected artifact files already exist', async () => {
  const workspace = await setupWorkspaceWithArtifacts();
  await initializeFRoute(workspace);

  const routePacket = JSON.parse(await readFile(path.join(workspace, '.agent-memory', 'route-packet.json'), 'utf8'));
  assert.deepEqual(routePacket.requiredDeliverables, [
    'round-contract.md',
    'execution-status.md',
    'evidence-ledger.md',
    'acceptance-report.md',
  ]);
  assert.deepEqual(routePacket.missingDeliverables, ['acceptance-report.md']);

  await rm(workspace, { recursive: true, force: true });
});

test('completed route with all deliverables present reports empty missingDeliverables', async () => {
  const workspace = await setupWorkspaceWithArtifacts();
  await writeFile(path.join(workspace, '.agent-memory', 'acceptance-report.md'), '# Acceptance Report\n');
  await initializeFRoute(workspace);

  const routePacket = JSON.parse(await readFile(path.join(workspace, '.agent-memory', 'route-packet.json'), 'utf8'));
  assert.deepEqual(routePacket.missingDeliverables, []);

  const status = await readFile(path.join(workspace, '.agent-memory', 'orchestration-status.md'), 'utf8');
  assert.match(status, /Missing Deliverables: none/);

  await rm(workspace, { recursive: true, force: true });
});
