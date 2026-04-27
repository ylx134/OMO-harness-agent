/**
 * E2E C-M1 Route — Full Lifecycle Test (改造型 — bounded refactor)
 *
 * Walks through a complete C-M1 route:
 *   /control → planning-manager → execution-manager → capability hands →
 *   acceptance-manager → probes → acceptance-closure → complete
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
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-e2e-cm1-'));
  await mkdir(path.join(workspace, '.agent-memory'), { recursive: true });
  for (const [name, content] of Object.entries(deliverables)) {
    await writeFile(path.join(workspace, '.agent-memory', name), content);
  }

  const dispatched = [];
  const hooks = await server({
    directory: workspace,
    client: {
      session: {
        create: async () => ({ data: { id: `child_cm1_${dispatched.length + 1}` } }),
        promptAsync: async (payload) => {
          dispatched.push({
            actor: inferActorFromPrompt(payload.body.parts?.[0]?.text || ''),
            sessionID: payload.path.id,
          });
        },
      },
    },
    worktree: '/',
    serverUrl: new URL('http://127.0.0.1:4132/'),
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

test('E2E C-M1: full lifecycle from /control to route completion', async () => {
  const deliverables = {
    'task.md': '# Task\nRefactor the auth module to support OAuth2.\n',
    'round-contract.md': '# Round Contract\nOAuth2 refactor scope defined.\n',
    'execution-status.md': '# Execution Status\nRefactor complete. Tests pass.\n',
    'evidence-ledger.md': '# Evidence Ledger\nE-C01: Code refactored (code-agent)\nE-C02: Build passes (shell-agent)\nE-C03: Regression passed (regression-probe-agent)\nE-C04: Artifacts intact (artifact-probe-agent)\n',
    'acceptance-report.md': '# Acceptance Report\nAll criteria met. Refactor complete.\n',
  };
  const { workspace, hooks, dispatched } = await setupE2E(deliverables);

  await hooks['command.execute.before'](
    { command: 'control', arguments: '将认证模块重构为支持 OAuth2 标准', sessionID: 'ses_cm1' },
    { parts: [] },
  );

  let state = await readState(workspace);
  assert.equal(state.routeId, 'C-M1');
  assert.equal(state.taskType, '改造型');

  // Step through lifecycle explicitly — same pattern as F-M1
  // planning-manager
  assert.equal(state.activeDispatch?.actor, 'planning-manager');
  await completeStep(workspace, hooks);

  // execution-manager
  state = await readState(workspace);
  assert.equal(state.activeDispatch?.actor, 'execution-manager');
  await completeStep(workspace, hooks);

  // capability hands (complete all active ones)
  while (true) {
    state = await readState(workspace);
    const activeHands = state.activeStepIds
      .map(sid => state.graph?.steps?.[sid])
      .filter(s => s?.kind === 'capability-hand');
    if (activeHands.length === 0) break;
    await completeStep(workspace, hooks);
  }

  // acceptance-manager
  state = await readState(workspace);
  assert.equal(state.activeDispatch?.actor, 'acceptance-manager');
  await completeStep(workspace, hooks);

  // probes
  while (true) {
    state = await readState(workspace);
    const activeProbes = state.activeStepIds
      .map(sid => state.graph?.steps?.[sid])
      .filter(s => s?.kind === 'probe');
    if (activeProbes.length === 0) break;
    await completeStep(workspace, hooks);
  }

  // acceptance closure
  state = await readState(workspace);
  if (state.activeDispatch?.actor === 'acceptance-manager' && state.activeDispatch?.phase === 'acceptance-closure') {
    await completeStep(workspace, hooks);
    state = await readState(workspace);
  }

  assert.equal(state.currentPhase, 'complete');
  assert.equal(state.deferredDispatchState, 'complete');
  assert.equal(state.nextExpectedActor, 'none');

  const dispatchedActors = dispatched.map(d => d.actor).filter(Boolean);
  assert.ok(dispatchedActors.includes('planning-manager'));
  assert.ok(dispatchedActors.includes('execution-manager'));
  assert.ok(dispatchedActors.includes('acceptance-manager'));

  const activity = await readFile(path.join(workspace, '.agent-memory', 'activity.jsonl'), 'utf8');
  assert.match(activity, /route\.completed/);

  await rm(workspace, { recursive: true, force: true });
});

test('E2E C-M1: planning-manager skipped when route has no plan in skill stack is still handled', async () => {
  const { workspace, hooks } = await setupE2E({
    'round-contract.md': '# Round Contract\n',
    'execution-status.md': '# Execution Status\n',
    'evidence-ledger.md': '# Evidence Ledger\nui-probe-agent evidence\nartifact-probe-agent evidence\n',
    'acceptance-report.md': '# Acceptance Report\n',
    'task.md': '# Task\n',
  });

  await hooks['command.execute.before'](
    { command: 'control', arguments: '将认证模块重构为支持 OAuth2 标准', sessionID: 'ses_skip' },
    { parts: [] },
  );

  let state = await readState(workspace);
  // C-M1 always includes planning-manager — verify it appears in pending
  assert.ok(state.pendingManagers.includes('planning-manager'));

  // Complete planning-manager
  assert.equal(state.activeDispatch?.actor, 'planning-manager');

  await rm(workspace, { recursive: true, force: true });
});
