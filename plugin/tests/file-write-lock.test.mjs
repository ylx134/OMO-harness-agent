import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { server } from '../dist/index.js';

function inferActorFromPrompt(text = '') {
  const match = text.match(/Harness plugin as ([^.\n]+)/);
  const actor = match?.[1] || undefined;
  return actor?.startsWith('acceptance-manager') ? 'acceptance-manager' : actor;
}

async function setupConcurrentHands() {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-file-lock-'));
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
    serverUrl: new URL('http://127.0.0.1:4129/'),
  });

  await hooks['command.execute.before'](
    { command: 'control', arguments: '为现有系统搭建一个完整产品级功能，覆盖关键用户旅程与发布质量', sessionID: 'ses_test' },
    { parts: [] },
  );

  for (let i = 0; i < 3; i += 1) {
    const state = await readState(workspace);
    await hooks['chat.message'](
      { agent: state.activeDispatch.actor, sessionID: state.activeDispatch.sessionID },
      { parts: [{ type: 'text', text: `${state.activeDispatch.actor} finished real work` }] },
    );
  }

  return { workspace, hooks, dispatched };
}

async function readState(workspace) {
  return JSON.parse(await readFile(path.join(workspace, '.agent-memory', 'harness-plugin-state.json'), 'utf8'));
}

function sessionFor(state, actor) {
  return Object.entries(state.stepRuntime || {}).find(([stepId, runtime]) => state.graph?.steps?.[stepId]?.actor === actor && runtime.activeSessionID)?.[1]?.activeSessionID;
}

async function writeAs(hooks, workspace, state, actor, filePath, content) {
  await hooks['tool.execute.before'](
    { tool: 'Write', agent: actor, sessionID: sessionFor(state, actor) },
    { args: { file_path: filePath, content } },
  );
  return readState(workspace);
}

test('live child actors cannot concurrently write the same governed file', async () => {
  const { workspace, hooks } = await setupConcurrentHands();
  let state = await readState(workspace);
  assert.deepEqual(new Set(state.activeStepIds), new Set(['capability-hand:docs-agent', 'capability-hand:browser-agent']));

  const ledgerPath = path.join(workspace, '.agent-memory', 'evidence-ledger.md');
  state = await writeAs(hooks, workspace, state, 'docs-agent', ledgerPath, '# Evidence Ledger\nD1\n');

  assert.equal(state.fileWriteLocks[ledgerPath].actor, 'docs-agent');

  await assert.rejects(
    () => writeAs(hooks, workspace, state, 'browser-agent', ledgerPath, '# Evidence Ledger\nB1\n'),
    /file write lock blocked this write/i,
  );

  await rm(workspace, { recursive: true, force: true });
});

test('live child actors can concurrently write different governed files', async () => {
  const { workspace, hooks } = await setupConcurrentHands();
  let state = await readState(workspace);

  state = await writeAs(
    hooks,
    workspace,
    state,
    'docs-agent',
    path.join(workspace, '.agent-memory', 'evidence-ledger.md'),
    '# Evidence Ledger\nD1\n',
  );

  state = await writeAs(
    hooks,
    workspace,
    state,
    'browser-agent',
    'evidence/browser-proof.md',
    '# Browser Proof\nB1\n',
  );

  assert.equal(Object.keys(state.fileWriteLocks || {}).length, 2);
  assert.equal(state.fileWriteLocks[path.join(workspace, 'evidence', 'browser-proof.md')].actor, 'browser-agent');

  await rm(workspace, { recursive: true, force: true });
});

test('file write locks are released when the holding child step completes', async () => {
  const { workspace, hooks } = await setupConcurrentHands();
  let state = await readState(workspace);
  const ledgerPath = path.join(workspace, '.agent-memory', 'evidence-ledger.md');

  state = await writeAs(hooks, workspace, state, 'docs-agent', ledgerPath, '# Evidence Ledger\nD1\n');
  assert.equal(state.fileWriteLocks[ledgerPath].actor, 'docs-agent');

  await hooks['chat.message'](
    { agent: 'docs-agent', sessionID: sessionFor(state, 'docs-agent') },
    { parts: [{ type: 'text', text: 'docs-agent finished real work' }] },
  );

  state = await readState(workspace);
  assert.equal(state.stepRuntime['capability-hand:docs-agent'].status, 'succeeded');
  assert.equal(state.fileWriteLocks?.[ledgerPath], undefined);

  state = await writeAs(hooks, workspace, state, 'browser-agent', ledgerPath, '# Evidence Ledger\nB1\n');
  assert.equal(state.fileWriteLocks[ledgerPath].actor, 'browser-agent');

  await rm(workspace, { recursive: true, force: true });
});
