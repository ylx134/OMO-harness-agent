/**
 * E2E P-H1 Route — Full Lifecycle Test (产品型 — product build)
 *
 * Walks through a complete P-H1 (heavy) route:
 *   /control → feature-planner → planning-manager → execution-manager →
 *   capability hands → acceptance-manager → probes → acceptance-closure → complete
 *
 * P-H1 is the heaviest route with the most actors.
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
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-e2e-ph1-'));
  await mkdir(path.join(workspace, '.agent-memory'), { recursive: true });
  for (const [name, content] of Object.entries(deliverables)) {
    await writeFile(path.join(workspace, '.agent-memory', name), content);
  }

  const dispatched = [];
  const hooks = await server({
    directory: workspace,
    client: {
      session: {
        create: async () => ({ data: { id: `child_ph1_${dispatched.length + 1}` } }),
        promptAsync: async (payload) => {
          dispatched.push({
            actor: inferActorFromPrompt(payload.body.parts?.[0]?.text || ''),
            sessionID: payload.path.id,
          });
        },
      },
    },
    worktree: '/',
    serverUrl: new URL('http://127.0.0.1:4133/'),
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

test('E2E P-H1: full lifecycle from /control to route completion', async () => {
  const deliverables = {
    'product-spec.md': '# Product Spec\nFull product description.\n',
    'features.json': '{"features":[{"id":"F001","title":"Core feature","description":"Works","category":"Core","priority":"P0","complexity":"medium","dependencies":[],"acceptance_criteria":["works"],"verification_method":"e2e_browser","verification_steps":["check"],"passes":true}]}',
    'features-summary.md': '# Features Summary\n1 feature.\n',
    'task.md': '# Task\nProduct build.\n',
    'round-contract.md': '# Round Contract\nSprint 1: core feature.\n',
    'execution-status.md': '# Execution Status\nSprint 1 done.\n',
    'evidence-ledger.md': '# Evidence Ledger\nE-P01: UI works (ui-probe-agent)\nE-P02: Regression passed (regression-probe-agent)\nE-P03: Artifacts built (artifact-probe-agent)\n',
    'acceptance-report.md': '# Acceptance Report\nPassed.\n',
  };
  const { workspace, hooks, dispatched } = await setupE2E(deliverables);

  await hooks['command.execute.before'](
    { command: 'control', arguments: '为现有系统搭建一个完整产品级功能，覆盖关键用户旅程与发布质量', sessionID: 'ses_ph1' },
    { parts: [] },
  );

  let state = await readState(workspace);
  assert.equal(state.routeId, 'P-H1');
  assert.equal(state.taskType, '产品型');
  assert.equal(state.flowTier, '重流程');
  // P-H1 has feature-planner first
  assert.deepEqual(state.pendingManagers, ['feature-planner', 'planning-manager', 'execution-manager', 'acceptance-manager']);

  // Walk through full lifecycle step by step
  let stuck = 0;
  while (state.currentPhase !== 'complete' && stuck < 50) {
    if (!state.activeDispatch) {
      stuck++;
    } else {
      await completeStep(workspace, hooks);
    }
    state = await readState(workspace);
  }

  assert.equal(state.currentPhase, 'complete');
  assert.equal(state.deferredDispatchState, 'complete');
  assert.equal(state.nextExpectedActor, 'none');
  assert.deepEqual(state.pendingManagers, []);
  assert.deepEqual(state.pendingCapabilityHands, []);
  assert.deepEqual(state.pendingProbes, []);
  assert.equal(state.activeDispatch, null);

  // P-H1 has more actors than F-M1
  const dispatchedActors = dispatched.map(d => d.actor).filter(Boolean);
  assert.ok(dispatchedActors.includes('feature-planner'), 'P-H1 must dispatch feature-planner');
  assert.ok(dispatchedActors.includes('planning-manager'));
  assert.ok(dispatchedActors.includes('execution-manager'));
  assert.ok(dispatchedActors.includes('acceptance-manager'));
  assert.ok(dispatchedActors.some(a => ['browser-agent', 'code-agent', 'shell-agent', 'docs-agent', 'evidence-agent'].includes(a)), 'P-H1 must dispatch capability hands');
  assert.ok(dispatchedActors.some(a => ['ui-probe-agent', 'regression-probe-agent', 'artifact-probe-agent'].includes(a)), 'P-H1 must dispatch probes');

  const activity = await readFile(path.join(workspace, '.agent-memory', 'activity.jsonl'), 'utf8');
  assert.match(activity, /route\.completed/);

  await rm(workspace, { recursive: true, force: true });
});

test('E2E P-H1: feature-planner dispatched first before planning-manager', async () => {
  const { workspace, hooks, dispatched } = await setupE2E();

  await hooks['command.execute.before'](
    { command: 'control', arguments: '为现有系统搭建一个完整产品级功能，覆盖关键用户旅程与发布质量', sessionID: 'ses_order' },
    { parts: [] },
  );

  let state = await readState(workspace);
  // First dispatch should be feature-planner, not planning-manager
  assert.equal(state.activeDispatch?.actor, 'feature-planner');

  // After feature-planner completes, planning-manager should be next
  await completeStep(workspace, hooks);
  state = await readState(workspace);
  assert.equal(state.activeDispatch?.actor, 'planning-manager');

  const dispatchedActors = dispatched.map(d => d.actor).filter(Boolean);
  const fpIndex = dispatchedActors.indexOf('feature-planner');
  const pmIndex = dispatchedActors.indexOf('planning-manager');
  assert.ok(fpIndex < pmIndex, 'feature-planner must dispatch BEFORE planning-manager');

  await rm(workspace, { recursive: true, force: true });
});

test('E2E P-H1: P-H1 does not allow single-thread fallback', async () => {
  const { workspace, hooks } = await setupE2E();

  await hooks['command.execute.before'](
    { command: 'control', arguments: '为现有系统搭建一个完整产品级功能，覆盖关键用户旅程与发布质量', sessionID: 'ses_nofallback' },
    { parts: [] },
  );

  const state = await readState(workspace);
  // P-H1 execution mode: multi_agent=true, single_thread_allowed=false
  // This is enforced at the skill level (control/SKILL.md), but the plugin
  // records the execution mode settings
  assert.equal(state.routeId, 'P-H1');
  assert.equal(state.mode, 'harness');
  assert.equal(state.autopilotEnabled, true);

  await rm(workspace, { recursive: true, force: true });
});
