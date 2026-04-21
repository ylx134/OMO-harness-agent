import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { server } from '../dist/index.js';

function inferActorFromPrompt(text = '') {
  const match = text.match(/Harness plugin as ([^.\n]+)/);
  const actor = match?.[1] || undefined;
  return actor?.startsWith('acceptance-manager') ? 'acceptance-manager' : actor;
}

async function setupHarness(commandText, writeAllDeliverables = false) {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-deliverable-gate-'));
  await mkdir(path.join(workspace, '.agent-memory'), { recursive: true });
  if (writeAllDeliverables) {
    for (const name of ['round-contract.md', 'execution-status.md', 'evidence-ledger.md', 'acceptance-report.md']) {
      await writeFile(path.join(workspace, '.agent-memory', name), `# ${name}\nreal content\n`);
    }
  }
  const dispatched = [];
  const hooks = await server({
    directory: workspace,
    client: {
      session: {
        create: async () => ({ data: { id: `child_${dispatched.length + 1}` } }),
        promptAsync: async (payload) => {
          dispatched.push({ actor: inferActorFromPrompt(payload.body.parts?.[0]?.text || ''), sessionID: payload.path.id });
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

  return { workspace, hooks, dispatched };
}

async function readState(workspace) {
  return JSON.parse(await readFile(path.join(workspace, '.agent-memory', 'harness-plugin-state.json'), 'utf8'));
}

async function completeActiveDispatch(workspace, hooks) {
  const state = await readState(workspace);
  if (!state.activeDispatch) return state;
  await hooks['chat.message'](
    { agent: state.activeDispatch.actor, sessionID: state.activeDispatch.sessionID },
    { parts: [{ type: 'text', text: `${state.activeDispatch.actor} finished real work` }] },
  );
  return readState(workspace);
}

async function waitForState(workspace, predicate, attempts = 80) {
  for (let i = 0; i < attempts; i += 1) {
    const state = await readState(workspace);
    if (predicate(state)) return state;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('timed out waiting for state condition');
}

async function advanceUntil(workspace, hooks, predicate, maxSteps = 20) {
  for (let i = 0; i < maxSteps; i += 1) {
    const state = await waitForState(workspace, (current) => Boolean(current.activeDispatch) || predicate(current));
    if (predicate(state)) return state;
    await completeActiveDispatch(workspace, hooks);
  }
  throw new Error('timed out advancing route');
}

test('single /control stops at retryable acceptance closure when deliverables are still missing', async () => {
  const { workspace, hooks, dispatched } = await setupHarness('修复构建报错并补上回归验证', false);

  await advanceUntil(workspace, hooks, (state) => state.deferredDispatchState === 'retryable_error');

  const after = await readState(workspace);
  assert.deepEqual(dispatched.map((entry) => entry.actor), [
    'planning-manager',
    'execution-manager',
    'shell-agent',
    'evidence-agent',
    'code-agent',
    'acceptance-manager',
    'regression-probe-agent',
    'artifact-probe-agent',
  ]);
  assert.equal(after.currentPhase, 'acceptance');
  assert.equal(after.nextExpectedActor, 'acceptance-manager');
  assert.equal(after.deferredDispatchState, 'retryable_error');
  assert.equal(after.lastDispatchError?.actor, 'acceptance-manager');
  assert.match(after.lastDispatchError?.message || '', /missing deliverables/i);
  assert.equal(after.activeDispatch, null);

  const routePacket = JSON.parse(await readFile(path.join(workspace, '.agent-memory', 'route-packet.json'), 'utf8'));
  assert.deepEqual(routePacket.missingDeliverables, [
    'round-contract.md',
    'execution-status.md',
    'evidence-ledger.md',
    'acceptance-report.md',
  ]);

  await rm(workspace, { recursive: true, force: true });
});

test('single /control marks complete only after acceptance closure itself completes', async () => {
  const { workspace, hooks, dispatched } = await setupHarness('修复构建报错并补上回归验证', true);

  let after = await advanceUntil(
    workspace,
    hooks,
    (state) => state.currentPhase === 'complete' || state.deferredDispatchState === 'acceptance_closure_in_progress',
  );

  assert.deepEqual(dispatched.map((entry) => entry.actor), [
    'planning-manager',
    'execution-manager',
    'shell-agent',
    'evidence-agent',
    'code-agent',
    'acceptance-manager',
    'regression-probe-agent',
    'artifact-probe-agent',
    'acceptance-manager',
  ]);
  if (after.currentPhase !== 'complete') {
    assert.equal(after.currentPhase, 'acceptance');
    assert.equal(after.nextExpectedActor, 'acceptance-manager');
    assert.equal(after.deferredDispatchState, 'acceptance_closure_in_progress');
    assert.equal(after.activeDispatch?.actor, 'acceptance-manager');

    await completeActiveDispatch(workspace, hooks);
    after = await readState(workspace);
  }

  assert.equal(after.currentPhase, 'complete');
  assert.equal(after.nextExpectedActor, 'none');
  assert.equal(after.deferredDispatchState, 'complete');

  const routePacket = JSON.parse(await readFile(path.join(workspace, '.agent-memory', 'route-packet.json'), 'utf8'));
  assert.deepEqual(routePacket.missingDeliverables, []);

  await rm(workspace, { recursive: true, force: true });
});
