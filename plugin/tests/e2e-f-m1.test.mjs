/**
 * E2E F-M1 Route — Full Lifecycle Test
 *
 * Walks through a complete F-M1 (修复型) route from /control to completion:
 *   /control → planning-manager → execution-manager → capability hands →
 *   acceptance-manager → probes → acceptance-closure → complete
 *
 * Verifies every phase transition, dispatch ordering, and final state.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { server } from '../dist/index.js';

function inferActorFromPrompt(text = '') {
  const match = text.match(/Harness plugin as ([^.\n]+)/);
  const actor = match?.[1] || undefined;
  return actor?.startsWith('acceptance-manager') ? 'acceptance-manager' : actor;
}

async function setupE2E(deliverables = {}) {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-e2e-fm1-'));
  await mkdir(path.join(workspace, '.agent-memory'), { recursive: true });
  for (const [name, content] of Object.entries(deliverables)) {
    await writeFile(path.join(workspace, '.agent-memory', name), content);
  }

  const dispatched = [];
  const hooks = await server({
    directory: workspace,
    client: {
      session: {
        create: async (payload) => {
          dispatched.push({ phase: 'create', payload });
          return { data: { id: `child_${dispatched.length}` } };
        },
        promptAsync: async (payload) => {
          dispatched.push({
            actor: inferActorFromPrompt(payload.body.parts?.[0]?.text || ''),
            sessionID: payload.path.id,
          });
        },
      },
    },
    worktree: '/',
    serverUrl: new URL('http://127.0.0.1:4131/'),
  });
  return { workspace, hooks, dispatched };
}

async function readState(workspace) {
  return JSON.parse(await readFile(path.join(workspace, '.agent-memory', 'harness-plugin-state.json'), 'utf8'));
}

async function completeStep(workspace, hooks) {
  const state = await readState(workspace);
  const actor = state.activeDispatch?.actor;
  const sessionID = state.activeDispatch?.sessionID;
  if (!actor || !sessionID) throw new Error('No active dispatch to complete');
  await hooks['chat.message'](
    { agent: actor, sessionID },
    { parts: [{ type: 'text', text: `${actor} completed work` }] },
  );
}

test('E2E F-M1: full lifecycle from /control to route completion', async () => {
  const deliverables = {
    'round-contract.md': '# Round Contract\nRound 1: fix build error\nchecklist:\n- [x] fix\npass conditions verified\n',
    'execution-status.md': '# Execution Status\nRound 1 complete. Build fixed.\n',
    'evidence-ledger.md': '# Evidence Ledger\nE-001: Build passes (shell-agent)\nE-002: Fix verified (code-agent)\nE-003: Regression check passed (regression-probe-agent)\nE-004: Artifacts intact (artifact-probe-agent)\n',
    'acceptance-report.md': '# Acceptance Report\nPassed. All criteria met.\n',
  };
  const { workspace, hooks, dispatched } = await setupE2E(deliverables);

  // ── Phase 0: /control intake ──────────────────────────────────
  await hooks['command.execute.before'](
    { command: 'control', arguments: '修复构建报错并补上回归验证', sessionID: 'ses_main' },
    { parts: [] },
  );

  let state = await readState(workspace);
  assert.equal(state.routeId, 'F-M1');
  assert.equal(state.currentPhase, 'planning');
  assert.equal(state.activeDispatch?.actor, 'planning-manager');
  assert.deepEqual(state.pendingManagers, ['planning-manager', 'execution-manager', 'acceptance-manager']);
  assert.deepEqual(dispatched.map(d => d.actor).filter(Boolean), ['planning-manager']);

  // ── Phase 1: planning-manager completes → execution-manager dispatched ──
  await completeStep(workspace, hooks);
  state = await readState(workspace);
  assert.equal(state.lastCompletedActor, 'planning-manager');
  assert.equal(state.activeDispatch?.actor, 'execution-manager');
  assert.equal(state.currentPhase, 'execution');

  // ── Phase 2: execution-manager completes → capability hands dispatched ──
  await completeStep(workspace, hooks);
  state = await readState(workspace);
  assert.equal(state.lastCompletedActor, 'execution-manager');
  assert.ok(state.pendingCapabilityHands.length > 0);
  // Hands are dispatched concurrently subject to lock constraints
  assert.ok(state.activeStepIds.length > 0);

  // ── Phase 3: complete all capability hands one by one ─────────
  const handSequence = [];
  while (true) {
    state = await readState(workspace);
    const activeHands = state.activeStepIds
      .map(sid => state.graph?.steps?.[sid])
      .filter(s => s?.kind === 'capability-hand');
    if (activeHands.length === 0) break;
    handSequence.push(state.activeDispatch?.actor);
    await completeStep(workspace, hooks);
  }

  state = await readState(workspace);
  assert.deepEqual(state.pendingCapabilityHands, []);
  assert.ok(state.dispatchedCapabilityHands.length >= 1, 'at least one capability hand dispatched');

  // ── Phase 4: acceptance-manager dispatched ─────────────────────
  // After all hands complete, the next pending manager is dispatched
  assert.ok(
    state.activeDispatch?.actor === 'acceptance-manager' || state.pendingManagers?.[0] === 'acceptance-manager',
    `expected acceptance-manager to be active or pending, got active=${state.activeDispatch?.actor} pending=${state.pendingManagers}`
  );

  // ── Phase 5: acceptance-manager completes → probes dispatched ──
  if (state.activeDispatch?.actor === 'acceptance-manager' && state.activeDispatch?.phase === 'manager') {
    await completeStep(workspace, hooks);
    state = await readState(workspace);
  }
  assert.equal(state.lastCompletedActor, 'acceptance-manager');
  assert.ok(state.pendingProbes.length > 0, 'probes should be pending');

  // ── Phase 6: complete all probes ──────────────────────────────
  while (true) {
    state = await readState(workspace);
    const activeProbes = state.activeStepIds
      .map(sid => state.graph?.steps?.[sid])
      .filter(s => s?.kind === 'probe');
    if (activeProbes.length === 0) break;
    await completeStep(workspace, hooks);
  }

  state = await readState(workspace);
  assert.deepEqual(state.pendingProbes, []);

  // ── Phase 7: acceptance closure dispatched and completed ──────
  assert.equal(state.activeDispatch?.actor, 'acceptance-manager');
  assert.equal(state.activeDispatch?.phase, 'acceptance-closure');
  await completeStep(workspace, hooks);

  // ── Phase 8: verify COMPLETE state ────────────────────────────
  state = await readState(workspace);
  assert.equal(state.currentPhase, 'complete');
  assert.equal(state.deferredDispatchState, 'complete');
  assert.equal(state.nextExpectedActor, 'none');
  assert.deepEqual(state.pendingManagers, []);
  assert.deepEqual(state.pendingCapabilityHands, []);
  assert.deepEqual(state.pendingProbes, []);
  assert.equal(state.activeDispatch, null);
  assert.equal(state.lastCompletedActor, 'acceptance-manager');

  // Full dispatch sequence should include all required actors
  const dispatchedActors = dispatched.map(d => d.actor).filter(Boolean);
  assert.ok(dispatchedActors.includes('planning-manager'));
  assert.ok(dispatchedActors.includes('execution-manager'));
  assert.ok(dispatchedActors.includes('acceptance-manager'));
  // At least one capability hand
  assert.ok(dispatchedActors.some(a => ['shell-agent', 'code-agent', 'evidence-agent'].includes(a)));
  // At least one probe
  assert.ok(dispatchedActors.some(a => ['regression-probe-agent', 'artifact-probe-agent'].includes(a)));

  // Verify activity.jsonl has completion events
  const activity = await readFile(path.join(workspace, '.agent-memory', 'activity.jsonl'), 'utf8');
  assert.match(activity, /route\.completed/);

  // Verify debug log has full trace
  const debug = await readFile(path.join(workspace, '.agent-memory', 'harness-plugin-debug.log'), 'utf8');
  assert.match(debug, /deferred\.manager\.completed/);
  assert.match(debug, /deferred\.hand\.completed/);
  assert.match(debug, /deferred\.probe\.completed/);
  assert.match(debug, /deferred\.acceptance\.closure\.completed/);

  await rm(workspace, { recursive: true, force: true });
});

test('E2E F-M1: graceful stop when deliverables are missing at closure time', async () => {
  // No deliverables pre-created — closure should be blocked
  const { workspace, hooks, dispatched } = await setupE2E();

  await hooks['command.execute.before'](
    { command: 'control', arguments: '修复构建报错并补上回归验证', sessionID: 'ses_block' },
    { parts: [] },
  );

  // Walk through all phases up to acceptance closure
  let state = await readState(workspace);
  const preClosureSequence = [
    'planning-manager', 'execution-manager',
  ];
  for (const agent of preClosureSequence) {
    await completeStep(workspace, hooks);
  }

  // Complete hands
  while (true) {
    state = await readState(workspace);
    const activeHands = state.activeStepIds
      .map(sid => state.graph?.steps?.[sid])
      .filter(s => s?.kind === 'capability-hand');
    if (activeHands.length === 0) break;
    await completeStep(workspace, hooks);
  }

  // Complete acceptance-manager
  state = await readState(workspace);
  if (state.activeDispatch?.actor === 'acceptance-manager' && state.activeDispatch?.phase === 'manager') {
    await completeStep(workspace, hooks);
  }

  // Complete probes
  while (true) {
    state = await readState(workspace);
    const activeProbes = state.activeStepIds
      .map(sid => state.graph?.steps?.[sid])
      .filter(s => s?.kind === 'probe');
    if (activeProbes.length === 0) break;
    await completeStep(workspace, hooks);
  }

  // Now at acceptance closure — but deliverables are missing
  state = await readState(workspace);
  // Should be in retryable error or blocked state, not complete
  assert.notEqual(state.currentPhase, 'complete');
  // The closure should be blocked with a retryable error about missing deliverables
  const debug = await readFile(path.join(workspace, '.agent-memory', 'harness-plugin-debug.log'), 'utf8');
  assert.match(debug, /blocked_missing_deliverables|retryable_error.*missing/);

  await rm(workspace, { recursive: true, force: true });
});
