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

async function setupHarness(commandText, initialDeliverables = {}) {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-concurrent-probe-'));
  await mkdir(path.join(workspace, '.agent-memory'), { recursive: true });
  for (const [name, content] of Object.entries(initialDeliverables)) {
    await writeFile(path.join(workspace, '.agent-memory', name), content);
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
    serverUrl: new URL('http://127.0.0.1:4126/'),
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
  await hooks['chat.message'](
    { agent: state.activeDispatch.actor, sessionID: state.activeDispatch.sessionID },
    { parts: [{ type: 'text', text: `${state.activeDispatch.actor} finished real work` }] },
  );
}

async function reachAcceptanceManager(workspace, hooks) {
  for (let i = 0; i < 5; i += 1) {
    await completeActiveDispatch(workspace, hooks);
  }
}

test('acceptance completion fans out bounded concurrent probes before any closure dispatch', async () => {
  const { workspace, hooks, dispatched } = await setupHarness('修复构建报错并补上回归验证', {
    'round-contract.md': '# Round Contract\nreal content\n',
    'execution-status.md': '# Execution Status\nreal content\n',
    'evidence-ledger.md': '# Evidence Ledger\nreal content\n',
    'acceptance-report.md': '# Acceptance Report\nreal content\n',
  });

  await reachAcceptanceManager(workspace, hooks);
  await completeActiveDispatch(workspace, hooks);

  const state = await readState(workspace);
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
  assert.deepEqual(new Set(state.activeStepIds), new Set(['probe:regression-probe-agent', 'probe:artifact-probe-agent']));
  assert.deepEqual(state.pendingProbes, ['regression-probe-agent', 'artifact-probe-agent']);
  assert.equal(state.currentPhase, 'probe-verification');
  assert.equal(state.activeDispatch?.actor, 'artifact-probe-agent');
  assert.equal(state.deferredDispatchState, 'probe_in_progress');

  const debug = await readFile(path.join(workspace, '.agent-memory', 'harness-plugin-debug.log'), 'utf8');
  assert.match(debug, /deferred\.probe\.dispatch\.requested/);
  assert.doesNotMatch(debug, /deferred\.acceptance\.closure\.requested/);

  await rm(workspace, { recursive: true, force: true });
});
