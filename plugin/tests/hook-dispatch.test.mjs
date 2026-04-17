import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { server } from '../dist/index.js';

async function runRoute(commandText) {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-plugin-'));
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
    serverUrl: new URL('http://127.0.0.1:4111/'),
  });

  await hooks['command.execute.before'](
    { command: 'control', arguments: commandText, sessionID: 'ses_test' },
    { parts: [] },
  );

  const state = JSON.parse(
    await readFile(path.join(workspace, '.agent-memory', 'harness-plugin-state.json'), 'utf8'),
  );
  const status = await readFile(path.join(workspace, '.agent-memory', 'orchestration-status.md'), 'utf8');
  const index = JSON.parse(
    await readFile(path.join(workspace, '.agent-memory', 'managed-agent-state-index.json'), 'utf8'),
  );
  const debug = await readFile(path.join(workspace, '.agent-memory', 'harness-plugin-debug.log'), 'utf8');
  const routePacket = JSON.parse(
    await readFile(path.join(workspace, '.agent-memory', 'route-packet.json'), 'utf8'),
  );

  await rm(workspace, { recursive: true, force: true });
  return { state, status, index, debug, routePacket, dispatched };
}

test('F-M1 command hook performs intake/state initialization without promptAsync dispatch', async () => {
  const result = await runRoute('修复构建报错并补上回归验证');
  assert.equal(result.state.routeId, 'F-M1');
  assert.deepEqual(result.state.requiredManagers, [
    'planning-manager',
    'execution-manager',
    'acceptance-manager',
  ]);
  assert.deepEqual(result.state.selectedCapabilityHands, [
    'shell-agent',
    'code-agent',
    'evidence-agent',
  ]);
  assert.deepEqual(result.state.selectedProbes, [
    'regression-probe-agent',
    'artifact-probe-agent',
  ]);
  assert.deepEqual(result.dispatched, []);
  assert.equal(result.state.currentPhase, 'intake');
  assert.equal(result.state.nextExpectedActor, 'planning-manager');
  assert.deepEqual(result.state.pendingManagers, ['planning-manager', 'execution-manager', 'acceptance-manager']);
  assert.deepEqual(result.state.pendingCapabilityHands, ['shell-agent', 'code-agent', 'evidence-agent']);
  assert.deepEqual(result.state.pendingProbes, ['regression-probe-agent', 'artifact-probe-agent']);
  assert.equal(result.state.deferredDispatchState, 'ready');
  assert.equal(result.state.lastCompletedActor, 'none');
  assert.deepEqual(result.state.dispatchedManagers, []);
  assert.deepEqual(result.state.dispatchedCapabilityHands, []);
  assert.deepEqual(result.state.dispatchedProbes, []);
  assert.match(result.status, /Current Phase: intake/);
  assert.match(result.status, /Expected Next Writer: planning-manager/);
  assert.match(result.status, /Reason for Lane:/);
  assert.match(result.status, /Routing Contract Row:/);
  assert.match(result.status, /Resolved Skill Stack:/);
  assert.match(result.status, /Required Startup Files:/);
  assert.match(result.status, /Required Deliverables:/);
  assert.match(result.status, /Missing Deliverables:/);
  assert.match(result.status, /Route Blocking Gaps: none/);
  assert.match(result.debug, /hook\.command\.before/);
  assert.match(result.debug, /state\.initialized\.from_command/);
  assert.match(result.debug, /dispatch\.deferred\.after_intake/);
  assert.doesNotMatch(result.debug, /manager\.auto_dispatch\.success/);
  assert.equal(result.routePacket.routeId, 'F-M1');
  assert.deepEqual(result.routePacket.requiredDeliverables, [
    'round-contract.md',
    'execution-status.md',
    'evidence-ledger.md',
    'acceptance-report.md',
  ]);
  assert.deepEqual(result.routePacket.pendingManagers, ['planning-manager', 'execution-manager', 'acceptance-manager']);
  assert.deepEqual(result.routePacket.pendingCapabilityHands, ['shell-agent', 'code-agent', 'evidence-agent']);
  assert.deepEqual(result.routePacket.pendingProbes, ['regression-probe-agent', 'artifact-probe-agent']);
  assert.equal(result.routePacket.deferredDispatchState, 'ready');
  assert.equal(result.routePacket.lastCompletedActor, 'none');
  assert.deepEqual(result.routePacket.missingDeliverables, result.routePacket.requiredDeliverables);
});

test('A-M1 intake preserves capability-planner as next expected actor without dispatching', async () => {
  const result = await runRoute('把系统真正改造成具备更深层的隐藏能力，并证明 API 行为可靠');
  assert.equal(result.state.routeId, 'A-M1');
  assert.deepEqual(result.state.requiredManagers, [
    'capability-planner',
    'planning-manager',
    'execution-manager',
    'acceptance-manager',
  ]);
  assert.equal(result.state.nextExpectedActor, 'capability-planner');
  assert.deepEqual(result.state.pendingManagers, [
    'capability-planner',
    'planning-manager',
    'execution-manager',
    'acceptance-manager',
  ]);
  assert.deepEqual(result.dispatched, []);
  assert.deepEqual(result.state.selectedProbes, [
    'api-probe-agent',
    'regression-probe-agent',
    'artifact-probe-agent',
  ]);
  assert.match(result.status, /Required Acceptance Gates:/);
  assert.ok(result.routePacket.requiredAcceptanceGates.includes('api-probe-agent'));
});

test('P-H1 intake preserves feature-planner and selected UI/browser actors without dispatching', async () => {
  const result = await runRoute('为现有系统搭建一个完整产品级功能，覆盖关键用户旅程与发布质量');
  assert.equal(result.state.routeId, 'P-H1');
  assert.deepEqual(result.state.requiredManagers, [
    'feature-planner',
    'planning-manager',
    'execution-manager',
    'acceptance-manager',
  ]);
  assert.equal(result.state.nextExpectedActor, 'feature-planner');
  assert.deepEqual(result.state.pendingManagers, [
    'feature-planner',
    'planning-manager',
    'execution-manager',
    'acceptance-manager',
  ]);
  assert.deepEqual(result.dispatched, []);
  assert.ok(result.state.selectedCapabilityHands.includes('browser-agent'));
  assert.ok(result.state.selectedProbes.includes('ui-probe-agent'));
  assert.match(result.status, /Selected Probes: ui-probe-agent, regression-probe-agent, artifact-probe-agent/);
  assert.ok(result.routePacket.requiredStartupFiles.includes('product-spec.md'));
  assert.ok(result.routePacket.requiredDeliverables.includes('features.json'));
});
