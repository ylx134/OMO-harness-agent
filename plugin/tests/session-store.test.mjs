import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { SessionStore, createSession } from '../dist/index.js';

test('SessionStore creates a session and writes session.json', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'sess-store-'));
  try {
    const store = new SessionStore({ workspaceRoot: workspace });
    const session = await store.createSession({ task: 'test task', routeId: 'F-M1' });

    assert.ok(session.sessionId, 'has sessionId');
    assert.ok(session.sessionId.startsWith('sess-'), 'sessionId has sess- prefix');
    assert.equal(session.task, 'test task');
    assert.equal(session.routeId, 'F-M1');
    assert.equal(session.workspaceRoot, workspace);
    assert.equal(session.version, 1);

    const sessionFile = path.join(workspace, '.agent-memory', 'sessions', session.sessionId, 'session.json');
    await access(sessionFile);
    const raw = JSON.parse(await readFile(sessionFile, 'utf8'));
    assert.equal(raw.sessionId, session.sessionId);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('SessionStore.getSession returns stored session', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'sess-store-'));
  try {
    const store = new SessionStore({ workspaceRoot: workspace });
    const created = await store.createSession({ task: 'get test', routeId: 'C-M1' });
    const retrieved = await store.getSession(created.sessionId);

    assert.equal(retrieved.sessionId, created.sessionId);
    assert.equal(retrieved.task, 'get test');
    assert.equal(retrieved.routeId, 'C-M1');
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('SessionStore.getSession returns empty object for unknown session (fallback)', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'sess-store-'));
  try {
    const store = new SessionStore({ workspaceRoot: workspace });
    const result = await store.getSession('sess-nonexistent');
    assert.equal(typeof result, 'object');
    assert.equal(Object.keys(result).length, 0);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('SessionStore.emitEvent appends to events.jsonl', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'sess-store-'));
  try {
    const store = new SessionStore({ workspaceRoot: workspace });
    const session = await store.createSession({ task: 'emit test' });

    await store.emitEvent(session.sessionId, { type: 'actor.dispatched', actor: 'code-agent' });
    await store.emitEvent(session.sessionId, { type: 'actor.completed', actor: 'code-agent' });

    const sessionDir = path.join(workspace, '.agent-memory', 'sessions', session.sessionId);
    const eventsFile = path.join(sessionDir, 'events.jsonl');
    const text = await readFile(eventsFile, 'utf8');
    const lines = text.trim().split('\n');

    assert.ok(lines.length >= 2, 'at least our 2 events + session.created = 3 events');
    const lastLine = JSON.parse(lines[lines.length - 1]);
    assert.equal(lastLine.type, 'actor.completed');
    assert.equal(lastLine.sessionId, session.sessionId);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('SessionStore.getEvents filters by type', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'sess-store-'));
  try {
    const store = new SessionStore({ workspaceRoot: workspace });
    const session = await store.createSession({ task: 'filter test' });

    await store.emitEvent(session.sessionId, { type: 'actor.dispatched', actor: 'a1' });
    await store.emitEvent(session.sessionId, { type: 'actor.completed', actor: 'a1' });
    await store.emitEvent(session.sessionId, { type: 'actor.dispatched', actor: 'a2' });
    await store.emitEvent(session.sessionId, { type: 'actor.blocked', actor: 'a2' });

    const dispatched = await store.getEvents(session.sessionId, { type: 'actor.dispatched' });
    assert.equal(dispatched.length, 2);

    const multiType = await store.getEvents(session.sessionId, { type: ['actor.dispatched', 'actor.blocked'] });
    assert.equal(multiType.length, 3);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('SessionStore.getEvents skips unknown session', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'sess-store-'));
  try {
    const store = new SessionStore({ workspaceRoot: workspace });
    const events = await store.getEvents('sess-unknown');
    assert.deepEqual(events, []);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('SessionStore.appendStatePatch persists patch', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'sess-store-'));
  try {
    const store = new SessionStore({ workspaceRoot: workspace });
    const session = await store.createSession({ task: 'patch test' });

    await store.appendStatePatch(session.sessionId, { currentPhase: 'planning' });
    await store.appendStatePatch(session.sessionId, { currentPhase: 'execution' });

    const patchesFile = path.join(workspace, '.agent-memory', 'sessions', session.sessionId, 'state-patches.jsonl');
    const text = await readFile(patchesFile, 'utf8');
    const lines = text.trim().split('\n');
    const lastPatch = JSON.parse(lines[lines.length - 1]);
    assert.equal(lastPatch.patch.currentPhase, 'execution');
    assert.equal(lastPatch.sessionId, session.sessionId);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('SessionStore.appendStatePatch throws on non-object', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'sess-store-'));
  try {
    const store = new SessionStore({ workspaceRoot: workspace });
    const session = await store.createSession({ task: 'bad patch' });
    await assert.rejects(
      () => store.appendStatePatch(session.sessionId, 'not-an-object'),
      { message: 'state patch must be an object' },
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('SessionStore.getLatestState merges patches and event actors', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'sess-store-'));
  try {
    const store = new SessionStore({ workspaceRoot: workspace });
    const session = await store.createSession({ task: 'state test', routeId: 'F-M1' });

    await store.appendStatePatch(session.sessionId, { custom: { key: 'val' } });
    await store.emitEvent(session.sessionId, { type: 'actor.dispatched', actor: 'code-agent' });
    await store.emitEvent(session.sessionId, { type: 'actor.completed', actor: 'code-agent' });

    const state = await store.getLatestState(session.sessionId);
    assert.equal(state.sessionId, session.sessionId);
    assert.equal(state.custom.key, 'val');
    assert.equal(state.actors['code-agent'], 'completed');
    assert.equal(state.eventCount, 3); // session.created + 2 emitted
    assert.equal(state.completed, false);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('SessionStore touchSession updates updatedAt', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'sess-store-'));
  try {
    const store = new SessionStore({ workspaceRoot: workspace });
    const session = await store.createSession({ task: 'touch test' });

    const updatedAt = new Date().toISOString();
    await store.touchSession(session.sessionId, updatedAt);
    const retrieved = await store.getSession(session.sessionId);
    assert.equal(retrieved.updatedAt, updatedAt);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('createSession standalone function creates a session', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'sess-store-'));
  try {
    const session = await createSession({ workspaceRoot: workspace, task: 'standalone', routeId: 'J-L1' });
    assert.ok(session.sessionId, 'has sessionId');
    assert.equal(session.task, 'standalone');
    assert.equal(session.routeId, 'J-L1');
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
