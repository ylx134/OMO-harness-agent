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
    { command: 'control', arguments: '修复构建报错并补上回归验证 --manual', sessionID: 'ses_test' },
    { parts: [] },
  );

  return hooks;
}

async function initializeRoute(workspace, commandText) {
  const hooks = await server({
    directory: workspace,
    client: { session: { promptAsync: async () => {} } },
    worktree: '/',
    serverUrl: new URL('http://127.0.0.1:4118/'),
  });

  await hooks['command.execute.before'](
    { command: 'control', arguments: commandText, sessionID: 'ses_test' },
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

test('product route placeholder scaffolds do not count as completed deliverables', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-product-deliverables-'));
  await mkdir(path.join(workspace, '.agent-memory'), { recursive: true });
  await writeFile(path.join(workspace, '.agent-memory', 'product-spec.md'), '# Product Spec\n\n');
  await writeFile(path.join(workspace, '.agent-memory', 'features.json'), '{}\n');
  await writeFile(path.join(workspace, '.agent-memory', 'features-summary.md'), '# Features Summary\n\n');

  await initializeRoute(workspace, '为现有系统搭建一个完整产品级功能，覆盖关键用户旅程与发布质量 --manual');

  const routePacket = JSON.parse(await readFile(path.join(workspace, '.agent-memory', 'route-packet.json'), 'utf8'));
  assert.deepEqual(routePacket.missingDeliverables, [
    'product-spec.md',
    'features.json',
    'features-summary.md',
    'round-contract.md',
    'execution-status.md',
    'evidence-ledger.md',
    'acceptance-report.md',
  ]);

  await rm(workspace, { recursive: true, force: true });
});

test('capability route placeholder scaffolds do not count as completed deliverables', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-capability-deliverables-'));
  await mkdir(path.join(workspace, '.agent-memory'), { recursive: true });
  await writeFile(path.join(workspace, '.agent-memory', 'baseline-source.md'), '# Baseline Source\n\n');
  await writeFile(path.join(workspace, '.agent-memory', 'capability-map.md'), '# Capability Map\n\n');
  await writeFile(path.join(workspace, '.agent-memory', 'gap-analysis.md'), '# Gap Analysis\n\n');

  await initializeRoute(workspace, '把系统真正改造成具备更深层的隐藏能力，并证明 API 行为可靠 --manual');

  const routePacket = JSON.parse(await readFile(path.join(workspace, '.agent-memory', 'route-packet.json'), 'utf8'));
  assert.deepEqual(routePacket.missingDeliverables, [
    'baseline-source.md',
    'capability-map.md',
    'gap-analysis.md',
    'round-contract.md',
    'execution-status.md',
    'evidence-ledger.md',
    'acceptance-report.md',
  ]);

  await rm(workspace, { recursive: true, force: true });
});
