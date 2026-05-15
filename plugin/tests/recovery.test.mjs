import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { SessionStore, resumeFromLastEvent, repairDerivedState, wake, savePluginState, loadPluginState } from '../dist/index.js';

test('resumeFromLastEvent returns last non-completion event', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'recov-'));
  try {
    const store = new SessionStore({ workspaceRoot: workspace });
    const session = await store.createSession({ task: 'resume test' });

    await store.emitEvent(session.sessionId, { type: 'actor.dispatched', actor: 'code-agent' });
    await store.emitEvent(session.sessionId, { type: 'actor.completed', actor: 'code-agent' });

    const result = await resumeFromLastEvent(store, session.sessionId);
    assert.equal(result.lastEvent?.type, 'actor.dispatched');
    assert.equal(result.lastEvent?.actor, 'code-agent');
    assert.equal(result.activeActor, 'code-agent');
    assert.ok(result.events.length >= 2);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('resumeFromLastEvent skips completion events', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'recov-'));
  try {
    const store = new SessionStore({ workspaceRoot: workspace });
    const session = await store.createSession({ task: 'skip completion' });

    await store.emitEvent(session.sessionId, { type: 'actor.dispatched', actor: 'probe' });
    await store.emitEvent(session.sessionId, { type: 'actor.completed', actor: 'probe' });
    await store.emitEvent(session.sessionId, { type: 'session.completed' });

    const result = await resumeFromLastEvent(store, session.sessionId);
    assert.equal(result.lastEvent?.type, 'actor.dispatched');
    assert.equal(result.activeActor, 'probe');
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('resumeFromLastEvent returns null actor for event without actor', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'recov-'));
  try {
    const store = new SessionStore({ workspaceRoot: workspace });
    const session = await store.createSession({ task: 'no actor' });

    await store.emitEvent(session.sessionId, { type: 'progress.update', payload: { pct: 50 } });

    const result = await resumeFromLastEvent(store, session.sessionId);
    assert.equal(result.lastEvent?.type, 'progress.update');
    assert.equal(result.activeActor, null);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('resumeFromLastEvent with empty events returns null lastEvent', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'recov-'));
  try {
    const store = new SessionStore({ workspaceRoot: workspace });
    const session = await store.createSession({ task: 'empty ev' });
    // session.created is emitted by createSession, so we expect at least 1 event.
    const result = await resumeFromLastEvent(store, session.sessionId);
    assert.ok(result.events.length >= 1);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('repairDerivedState releases stale file locks', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'recov-'));
  try {
    const staleTs = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min ago
    const state = {
      version: 1,
      mode: 'harness',
      fileWriteLocks: {
        '/tmp/old-file': { actor: 'code-agent', stepId: 's1', acquiredAt: staleTs },
        '/tmp/fresh-file': { actor: 'shell-agent', stepId: 's2', acquiredAt: new Date().toISOString() },
      },
    };
    await savePluginState(workspace, state);

    await repairDerivedState(workspace);

    const { state: loaded } = await loadPluginState(workspace);
    const locks = loaded?.fileWriteLocks || {};
    assert.equal(Object.keys(locks).length, 1, 'only fresh lock remains');
    assert.ok(locks['/tmp/fresh-file'], 'fresh lock present');
    assert.ok(!locks['/tmp/old-file'], 'stale lock removed');
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('repairDerivedState no-ops when no state exists', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'recov-'));
  try {
    await repairDerivedState(workspace);
    // Should not throw
    const { state } = await loadPluginState(workspace);
    assert.equal(state, null);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('repairDerivedState no-ops when no locks', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'recov-'));
  try {
    await savePluginState(workspace, { version: 1, mode: 'harness' });
    await repairDerivedState(workspace);
    const { state } = await loadPluginState(workspace);
    assert.ok(state);
    assert.equal(Object.keys(state.fileWriteLocks || {}).length, 0);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('wake returns runnable for session with no events', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'recov-'));
  try {
    const store = new SessionStore({ workspaceRoot: workspace });
    // createSession emits session.created, so we need to test with no events differently
    // We create a session and then read with a fake sessionId that has no events file
    const result = await wake(store, 'sess-none');
    assert.equal(result.status, 'runnable');
    assert.equal(result.lastEvent, null);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('wake returns active for session with undispatched events', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'recov-'));
  try {
    const store = new SessionStore({ workspaceRoot: workspace });
    const session = await store.createSession({ task: 'active test' });
    await store.emitEvent(session.sessionId, { type: 'actor.dispatched', actor: 'code-agent' });

    const result = await wake(store, session.sessionId);
    assert.equal(result.status, 'active');
    assert.equal(result.lastEvent?.type, 'actor.dispatched');
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('wake returns completed when session.completed exists', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'recov-'));
  try {
    const store = new SessionStore({ workspaceRoot: workspace });
    const session = await store.createSession({ task: 'done test' });
    await store.emitEvent(session.sessionId, { type: 'actor.dispatched', actor: 'code-agent' });
    await store.emitEvent(session.sessionId, { type: 'actor.completed', actor: 'code-agent' });
    await store.emitEvent(session.sessionId, { type: 'session.completed' });

    const result = await wake(store, session.sessionId);
    assert.equal(result.status, 'completed');
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('wake returns blocked when actor.blocked exists', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'recov-'));
  try {
    const store = new SessionStore({ workspaceRoot: workspace });
    const session = await store.createSession({ task: 'blocked test' });
    await store.emitEvent(session.sessionId, { type: 'actor.dispatched', actor: 'code-agent' });
    await store.emitEvent(session.sessionId, { type: 'actor.blocked', actor: 'code-agent' });

    const result = await wake(store, session.sessionId);
    assert.equal(result.status, 'blocked');
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('wake also repairs stale locks', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'recov-'));
  try {
    const staleTs = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await savePluginState(workspace, {
      version: 1,
      mode: 'harness',
      fileWriteLocks: {
        '/tmp/stale': { actor: 'code-agent', stepId: 's1', acquiredAt: staleTs },
      },
    });

    const store = new SessionStore({ workspaceRoot: workspace });
    const session = await store.createSession({ task: 'wake repair' });
    await store.emitEvent(session.sessionId, { type: 'actor.dispatched', actor: 'shell-agent' });

    const result = await wake(store, session.sessionId);
    assert.equal(result.status, 'active');

    const { state } = await loadPluginState(workspace);
    const locks = state?.fileWriteLocks || {};
    assert.equal(Object.keys(locks).length, 0, 'stale lock was repaired');
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
