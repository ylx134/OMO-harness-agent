import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { server } from '../dist/index.js';

function inferActorFromPrompt(text = '') {
  const match = text.match(/Harness plugin as ([^.\n]+)/);
  const actor = match?.[1] || undefined;
  return actor?.startsWith('acceptance-manager') ? 'acceptance-manager' : actor;
}

async function setupHarness(commandText) {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-deferred-manager-'));
  const dispatched = [];
  const hooks = await server({
    directory: workspace,
    client: {
      session: {
        create: async () => ({ data: { id: `child_${dispatched.length + 1}` } }),
        promptAsync: async (payload) => {
          const text = payload.body.parts?.[0]?.text || '';
          dispatched.push({ actor: inferActorFromPrompt(text), sessionID: payload.path.id, text });
        },
      },
    },
    worktree: '/',
    serverUrl: new URL('http://127.0.0.1:4116/'),
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

async function emitMessage(hooks, agent, sessionID, text) {
  await hooks['chat.message']({ agent, sessionID }, { parts: [{ type: 'text', text }] });
}

async function emitToolAfter(hooks, tool, agent, sessionID, title = '') {
  await hooks['tool.execute.after'](
    { tool, agent, sessionID },
    { title },
  );
}

function createMessageDb(filePath) {
  const db = new DatabaseSync(filePath);
  db.exec(`
    CREATE TABLE message (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL,
      data TEXT NOT NULL
    );
  `);
  return db;
}

test('single /control dispatches planning-manager first for F-M1 and waits for its completion', async () => {
  const { workspace, hooks, dispatched } = await setupHarness('修复构建报错并补上回归验证');

  let after = await readState(workspace);
  assert.equal(dispatched[0].actor, 'planning-manager');
  assert.equal(after.dispatchedManagers[0], 'planning-manager');
  assert.equal(after.currentPhase, 'planning');
  assert.equal(after.nextExpectedActor, 'planning-manager');
  assert.equal(after.deferredDispatchState, 'manager_in_progress');
  assert.deepEqual(after.pendingManagers, ['planning-manager', 'execution-manager', 'acceptance-manager']);

  await emitMessage(
    hooks,
    'planning-manager',
    after.activeDispatch.sessionID,
    'You are being auto-dispatched by the Harness plugin as planning-manager.',
  );

  after = await readState(workspace);
  assert.deepEqual(dispatched.map((entry) => entry.actor), ['planning-manager']);
  assert.deepEqual(after.pendingManagers, ['planning-manager', 'execution-manager', 'acceptance-manager']);
  assert.equal(after.lastCompletedActor, 'none');

  await emitMessage(hooks, 'planning-manager', after.activeDispatch.sessionID, 'planning manager finished the route contract');

  after = await readState(workspace);
  assert.deepEqual(dispatched.map((entry) => entry.actor), ['planning-manager', 'execution-manager']);
  assert.deepEqual(after.pendingManagers, ['execution-manager', 'acceptance-manager']);
  assert.equal(after.lastCompletedActor, 'planning-manager');
  assert.equal(after.activeDispatch?.actor, 'execution-manager');

  const debug = await readFile(path.join(workspace, '.agent-memory', 'harness-plugin-debug.log'), 'utf8');
  assert.match(debug, /deferred\.manager\.dispatch\.requested/);
  assert.match(debug, /hook\.chat\.message\.synthetic_ignored/);

  await rm(workspace, { recursive: true, force: true });
});

test('single /control dispatches capability-planner first for A-M1 and waits for its completion', async () => {
  const { workspace, hooks, dispatched } = await setupHarness('把系统真正改造成具备更深层的隐藏能力，并证明 API 行为可靠');

  let after = await readState(workspace);
  assert.equal(dispatched[0].actor, 'capability-planner');
  assert.equal(after.dispatchedManagers[0], 'capability-planner');
  assert.equal(after.currentPhase, 'planning');
  assert.equal(after.nextExpectedActor, 'capability-planner');
  assert.deepEqual(after.pendingManagers, ['capability-planner', 'planning-manager', 'execution-manager', 'acceptance-manager']);

  await emitMessage(hooks, 'capability-planner', after.activeDispatch.sessionID, 'capability planner completed baseline and gap analysis');

  after = await readState(workspace);
  assert.deepEqual(dispatched.map((entry) => entry.actor), ['capability-planner', 'planning-manager']);
  assert.deepEqual(after.pendingManagers, ['planning-manager', 'execution-manager', 'acceptance-manager']);
  assert.equal(after.lastCompletedActor, 'capability-planner');
  assert.equal(after.activeDispatch?.actor, 'planning-manager');

  await rm(workspace, { recursive: true, force: true });
});

test('planning-manager can advance the route from real tool evidence even if no child completion chat message arrives', async () => {
  const { workspace, hooks, dispatched } = await setupHarness('修复构建报错并补上回归验证');

  let after = await readState(workspace);
  await writeFile(path.join(workspace, '.agent-memory', 'round-contract.md'), '# Round Contract\nreal content\n');
  await emitToolAfter(hooks, 'apply_patch', 'planning-manager', after.activeDispatch.sessionID, 'updated round contract');

  after = await readState(workspace);
  assert.deepEqual(dispatched.map((entry) => entry.actor), ['planning-manager', 'execution-manager']);
  assert.deepEqual(after.pendingManagers, ['execution-manager', 'acceptance-manager']);
  assert.equal(after.lastCompletedActor, 'planning-manager');
  assert.equal(after.activeDispatch?.actor, 'execution-manager');

  await rm(workspace, { recursive: true, force: true });
});

test('planning-manager can advance from durable workspace artifacts even if the host never sends a late callback', async () => {
  const { workspace, dispatched } = await setupHarness('修复构建报错并补上回归验证');

  await writeFile(path.join(workspace, '.agent-memory', 'round-contract.md'), '# Round Contract\nreal content\n');
  await new Promise((resolve) => setTimeout(resolve, 800));

  const after = await readState(workspace);
  assert.deepEqual(dispatched.map((entry) => entry.actor), ['planning-manager', 'execution-manager']);
  assert.deepEqual(after.pendingManagers, ['execution-manager', 'acceptance-manager']);
  assert.equal(after.lastCompletedActor, 'planning-manager');
  assert.equal(after.stepRuntime['manager:planning-manager']?.completionSource, 'workspace-artifact');
  assert.equal(after.activeDispatch?.actor, 'execution-manager');

  await rm(workspace, { recursive: true, force: true });
});

test('planning-manager can advance from a completed child session recorded in the host session store', async () => {
  const dbDir = await mkdtemp(path.join(os.tmpdir(), 'harness-opencode-db-'));
  const dbPath = path.join(dbDir, 'opencode.db');
  const previousDbPath = process.env.OPENCODE_DB_PATH;
  process.env.OPENCODE_DB_PATH = dbPath;

  const db = createMessageDb(dbPath);

  try {
    const { workspace, dispatched } = await setupHarness('修复构建报错并补上回归验证');
    let after = await readState(workspace);
    const startedAt = Date.parse(after.activeDispatch.startedAt);
    db.prepare('INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES (?, ?, ?, ?, ?)').run(
      'msg_child_complete',
      after.activeDispatch.sessionID,
      startedAt + 1000,
      startedAt + 1200,
      JSON.stringify({
        role: 'assistant',
        agent: 'planning-manager',
        finish: 'stop',
        time: { created: startedAt + 1000, completed: startedAt + 1200 },
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 800));

    after = await readState(workspace);
    assert.deepEqual(dispatched.map((entry) => entry.actor), ['planning-manager', 'execution-manager']);
    assert.deepEqual(after.pendingManagers, ['execution-manager', 'acceptance-manager']);
    assert.equal(after.lastCompletedActor, 'planning-manager');
    assert.equal(after.activeDispatch?.actor, 'execution-manager');

    await rm(workspace, { recursive: true, force: true });
  } finally {
    db.close();
    if (previousDbPath === undefined) {
      delete process.env.OPENCODE_DB_PATH;
    } else {
      process.env.OPENCODE_DB_PATH = previousDbPath;
    }
    await rm(dbDir, { recursive: true, force: true });
  }
});
