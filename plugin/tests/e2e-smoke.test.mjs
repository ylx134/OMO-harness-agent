/**
 * E2E Smoke Tests — Plugin Load and State Integrity
 *
 * Verifies the plugin loads correctly, writes memory scaffolding,
 * generates expected state files, and the phase-guard blocks
 * unauthorized file writes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { server, id } from '../dist/index.js';

async function setupPlugin() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-e2e-smoke-'));
  const hooks = await server({
    directory: workspace,
    client: {
      session: {
        create: async () => ({ data: { id: 'child_smoke_1' } }),
        promptAsync: async () => {},
      },
    },
    worktree: '/',
    serverUrl: new URL('http://127.0.0.1:4130/'),
  });
  return { workspace, hooks };
}

async function readState(workspace) {
  return JSON.parse(await readFile(path.join(workspace, '.agent-memory', 'harness-plugin-state.json'), 'utf8'));
}

async function fileExists(workspace, relativePath) {
  try {
    await stat(path.join(workspace, relativePath));
    return true;
  } catch {
    return false;
  }
}

test('plugin exports correct id', () => {
  assert.equal(id, 'omo-harness-plugin');
});

test('/control initializes .agent-memory/ scaffold with all required files', async () => {
  const { workspace, hooks } = await setupPlugin();

  await hooks['command.execute.before'](
    { command: 'control', arguments: '修复构建报错并补上回归验证', sessionID: 'ses_init' },
    { parts: [] },
  );

  const requiredFiles = [
    '.agent-memory/task.md',
    '.agent-memory/brain-brief.md',
    '.agent-memory/route-summary.md',
    '.agent-memory/risk-summary.md',
    '.agent-memory/acceptance-summary.md',
    '.agent-memory/orchestration-status.md',
    '.agent-memory/working-memory.md',
    '.agent-memory/round-contract.md',
    '.agent-memory/execution-status.md',
    '.agent-memory/acceptance-report.md',
    '.agent-memory/evidence-ledger.md',
    '.agent-memory/route-packet.json',
    '.agent-memory/harness-plugin-state.json',
    '.agent-memory/managed-agent-state-index.json',
    '.agent-memory/inbox/index.jsonl',
    'init.sh',
    'claude-progress.txt',
  ];

  for (const file of requiredFiles) {
    assert.ok(await fileExists(workspace, file), `missing file: ${file}`);
  }

  await rm(workspace, { recursive: true, force: true });
});

test('/control F-M1 writes correct route state', async () => {
  const { workspace, hooks } = await setupPlugin();

  await hooks['command.execute.before'](
    { command: 'control', arguments: '修复构建报错并补上回归验证', sessionID: 'ses_fm1' },
    { parts: [] },
  );

  const state = await readState(workspace);
  assert.equal(state.routeId, 'F-M1');
  assert.equal(state.taskType, '修复型');
  assert.equal(state.flowTier, '中流程');
  assert.equal(state.mode, 'harness');
  assert.equal(state.semanticLockStatus, 'locked');
  assert.equal(state.blocked, false);
  assert.ok(state.requestId.startsWith('REQ-'));
  assert.deepEqual(state.pendingManagers, ['planning-manager', 'execution-manager', 'acceptance-manager']);

  // Hands/probes selected at init but not yet dispatched
  assert.ok(state.selectedCapabilityHands.length > 0);
  assert.ok(state.selectedProbes.length > 0);
  assert.deepEqual(state.dispatchedCapabilityHands, []);
  assert.deepEqual(state.dispatchedProbes, []);

  await rm(workspace, { recursive: true, force: true });
});

test('/control P-H1 writes correct route state', async () => {
  const { workspace, hooks } = await setupPlugin();

  await hooks['command.execute.before'](
    { command: 'control', arguments: '为现有系统搭建一个完整产品级功能，覆盖关键用户旅程与发布质量', sessionID: 'ses_ph1' },
    { parts: [] },
  );

  const state = await readState(workspace);
  assert.equal(state.routeId, 'P-H1');
  assert.equal(state.taskType, '产品型');
  assert.equal(state.flowTier, '重流程');
  assert.deepEqual(state.pendingManagers, ['feature-planner', 'planning-manager', 'execution-manager', 'acceptance-manager']);
  assert.ok(state.selectedCapabilityHands.includes('browser-agent'));

  await rm(workspace, { recursive: true, force: true });
});

test('/control J-L1 ambiguous request enters blocked state', async () => {
  const { workspace, hooks } = await setupPlugin();

  await hooks['command.execute.before'](
    { command: 'control', arguments: '看看这个', sessionID: 'ses_blocked' },
    { parts: [] },
  );

  const state = await readState(workspace);
  assert.equal(state.blocked, true);
  assert.ok(state.blockedReason.includes('Clarification required'));
  assert.equal(state.currentPhase, 'blocked');
  assert.equal(state.semanticLockStatus, 'needs_clarification');

  await rm(workspace, { recursive: true, force: true });
});

test('plugin debug log records intake event', async () => {
  const { workspace, hooks } = await setupPlugin();

  await hooks['command.execute.before'](
    { command: 'control', arguments: '修复构建报错并补上回归验证', sessionID: 'ses_debug' },
    { parts: [] },
  );

  const debug = await readFile(path.join(workspace, '.agent-memory', 'harness-plugin-debug.log'), 'utf8');
  assert.match(debug, /plugin\.server\.init/);
  assert.match(debug, /state\.initialized\.from_command/);

  await rm(workspace, { recursive: true, force: true });
});

test('activity.jsonl records intake and route events', async () => {
  const { workspace, hooks } = await setupPlugin();

  await hooks['command.execute.before'](
    { command: 'control', arguments: '修复构建报错并补上回归验证', sessionID: 'ses_act' },
    { parts: [] },
  );

  const activity = await readFile(path.join(workspace, '.agent-memory', 'activity.jsonl'), 'utf8');
  assert.match(activity, /task\.intake/);
  assert.match(activity, /route\.selected/);

  await rm(workspace, { recursive: true, force: true });
});

test('phase-guard blocks execution-manager from writing task.md', async () => {
  const { workspace, hooks } = await setupPlugin();

  await hooks['command.execute.before'](
    { command: 'control', arguments: '修复构建报错并补上回归验证', sessionID: 'ses_guard' },
    { parts: [] },
  );

  // Dispatch planning-manager and execution-manager
  let state = await readState(workspace);
  await hooks['chat.message'](
    { agent: 'planning-manager', sessionID: state.activeDispatch.sessionID },
    { parts: [{ type: 'text', text: 'planning done' }] },
  );

  state = await readState(workspace);
  assert.equal(state.activeDispatch?.actor, 'execution-manager');

  // execution-manager tries to write task.md → should be BLOCKED
  // (task.md is owned by planning-manager, not execution-manager)
  let blocked = false;
  try {
    await hooks['tool.execute.before'](
      { tool: 'Write', agent: 'execution-manager', sessionID: state.activeDispatch.sessionID },
      { args: { file_path: path.join(workspace, '.agent-memory', 'task.md'), content: '# fake task update' } },
    );
  } catch (err) {
    blocked = true;
    assert.match(err.message, /Phase-actor authorization blocked/);
    assert.match(err.message, /task\.md/);
  }
  assert.ok(blocked, 'execution-manager writing task.md should be blocked by phase-guard');

  await rm(workspace, { recursive: true, force: true });
});

test('phase-guard allows acceptance-manager to write acceptance-lessons.md', async () => {
  const { workspace, hooks } = await setupPlugin();

  await hooks['command.execute.before'](
    { command: 'control', arguments: '修复构建报错并补上回归验证', sessionID: 'ses_allow' },
    { parts: [] },
  );

  // Walk through to acceptance-manager
  let state = await readState(workspace);

  // Complete planning-manager and execution-manager
  for (let i = 0; i < 2; i++) {
    await hooks['chat.message'](
      { agent: state.activeDispatch.actor, sessionID: state.activeDispatch.sessionID },
      { parts: [{ type: 'text', text: `${state.activeDispatch.actor} done` }] },
    );
    state = await readState(workspace);
  }

  // Complete all hands
  while (true) {
    state = await readState(workspace);
    const activeHands = state.activeStepIds
      .map(sid => state.graph?.steps?.[sid])
      .filter(s => s?.kind === 'capability-hand');
    if (activeHands.length === 0) break;
    await hooks['chat.message'](
      { agent: state.activeDispatch.actor, sessionID: state.activeDispatch.sessionID },
      { parts: [{ type: 'text', text: `${state.activeDispatch.actor} done` }] },
    );
  }

  // Now acceptance-manager should be the active dispatch
  state = await readState(workspace);
  assert.equal(state.activeDispatch?.actor, 'acceptance-manager');

  // acceptance-manager writes acceptance-lessons.md → allowed (owned by acceptance-manager, no probe guard)
  let allowed = true;
  try {
    await hooks['tool.execute.before'](
      { tool: 'Write', agent: 'acceptance-manager', sessionID: state.activeDispatch.sessionID },
      { args: { file_path: path.join(workspace, '.agent-memory', 'acceptance-lessons.md'), content: '# lessons' } },
    );
  } catch (err) {
    allowed = false;
  }
  assert.ok(allowed, 'acceptance-manager writing acceptance-lessons.md should be allowed');

  await rm(workspace, { recursive: true, force: true });
});
