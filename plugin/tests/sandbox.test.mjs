import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  createSandbox,
  resolveSandboxPath,
  isPathInSandbox,
  destroySandbox,
  saveSandboxState,
  loadSandboxState,
} from '../dist/index.js';

// ── createSandbox ──────────────────────────────────────────────────────

test('createSandbox creates sandbox directory', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-sandbox-'));
  const sandbox = await createSandbox(root);

  const dirStat = await stat(sandbox.sandboxRoot);
  assert.ok(dirStat.isDirectory());

  await destroySandbox(sandbox.sandboxRoot);
  await rm(root, { recursive: true, force: true });
});

test('createSandbox returns sandboxId and sandboxRoot', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-sandbox-'));
  const sandbox = await createSandbox(root);

  assert.ok(sandbox.sandboxId);
  assert.match(sandbox.sandboxId, /^sandbox-/);
  assert.ok(sandbox.sandboxRoot);
  assert.ok(sandbox.sandboxRoot.startsWith(root));
  assert.ok(sandbox.sandboxRoot.includes(sandbox.sandboxId));

  await destroySandbox(sandbox.sandboxRoot);
  await rm(root, { recursive: true, force: true });
});

test('createSandbox uses os.tmpdir() when no basePath given', async () => {
  const sandbox = await createSandbox();

  assert.ok(sandbox.sandboxRoot);
  assert.ok(sandbox.sandboxId);

  await destroySandbox(sandbox.sandboxRoot);
});

// ── resolveSandboxPath ─────────────────────────────────────────────────

test('resolveSandboxPath resolves path inside sandbox', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-sandbox-'));
  const sandbox = await createSandbox(root);

  const resolved = resolveSandboxPath(sandbox.sandboxRoot, 'subdir/file.txt');
  assert.ok(resolved.startsWith(sandbox.sandboxRoot));
  assert.ok(resolved.endsWith(path.join('subdir', 'file.txt')));

  await destroySandbox(sandbox.sandboxRoot);
  await rm(root, { recursive: true, force: true });
});

test('resolveSandboxPath throws when path escapes sandbox', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-sandbox-'));
  const sandbox = await createSandbox(root);

  assert.throws(() => {
    resolveSandboxPath(sandbox.sandboxRoot, '../outside');
  }, /escapes sandbox/);

  await destroySandbox(sandbox.sandboxRoot);
  await rm(root, { recursive: true, force: true });
});

test('resolveSandboxPath throws on absolute path outside sandbox', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-sandbox-'));
  const sandbox = await createSandbox(root);

  assert.throws(() => {
    resolveSandboxPath(sandbox.sandboxRoot, '/etc/passwd');
  }, /escapes sandbox/);

  await destroySandbox(sandbox.sandboxRoot);
  await rm(root, { recursive: true, force: true });
});

// ── isPathInSandbox ────────────────────────────────────────────────────

test('isPathInSandbox returns true for paths inside sandbox', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-sandbox-'));
  const sandbox = await createSandbox(root);

  const inside = path.join(sandbox.sandboxRoot, 'data', 'file.json');
  assert.equal(isPathInSandbox(sandbox.sandboxRoot, inside), true);

  const rootDir = sandbox.sandboxRoot;
  assert.equal(isPathInSandbox(sandbox.sandboxRoot, rootDir), true);

  await destroySandbox(sandbox.sandboxRoot);
  await rm(root, { recursive: true, force: true });
});

test('isPathInSandbox returns false for paths outside sandbox', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-sandbox-'));
  const sandbox = await createSandbox(root);

  assert.equal(isPathInSandbox(sandbox.sandboxRoot, '/etc/passwd'), false);
  assert.equal(isPathInSandbox(sandbox.sandboxRoot, path.join(root, 'other')), false);

  await destroySandbox(sandbox.sandboxRoot);
  await rm(root, { recursive: true, force: true });
});

// ── destroySandbox ─────────────────────────────────────────────────────

test('destroySandbox removes sandbox directory', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-sandbox-'));
  const sandbox = await createSandbox(root);

  await destroySandbox(sandbox.sandboxRoot);

  await assert.rejects(
    () => stat(sandbox.sandboxRoot),
  );

  await rm(root, { recursive: true, force: true });
});

// ── Sandbox state persistence ──────────────────────────────────────────

test('Sandbox state is persisted to JSON file', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-sandbox-'));
  const sandbox = await createSandbox(root);

  const state = { phase: 'execution', step: 3, data: { key: 'value' } };
  await saveSandboxState(sandbox.sandboxRoot, state);

  const loaded = await loadSandboxState(sandbox.sandboxRoot);
  assert.deepEqual(loaded, state);

  await destroySandbox(sandbox.sandboxRoot);
  await rm(root, { recursive: true, force: true });
});

test('Sandbox survives process restart (write and re-read)', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-sandbox-'));
  const sandbox = await createSandbox(root);

  const originalState = {
    routeId: 'F-M1-test',
    currentStep: 'execution',
    metadata: { created: Date.now() },
  };
  await saveSandboxState(sandbox.sandboxRoot, originalState);

  // Simulate restart: re-read from disk in a new variable
  const recovered = await loadSandboxState(sandbox.sandboxRoot);
  assert.deepEqual(recovered, originalState);

  await destroySandbox(sandbox.sandboxRoot);
  await rm(root, { recursive: true, force: true });
});

test('loadSandboxState returns null when no state file exists', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-sandbox-'));
  const sandbox = await createSandbox(root);

  const result = await loadSandboxState(sandbox.sandboxRoot);
  assert.equal(result, null);

  await destroySandbox(sandbox.sandboxRoot);
  await rm(root, { recursive: true, force: true });
});

// ── Multiple sandboxes ─────────────────────────────────────────────────

test('Multiple sandboxes can coexist without interference', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-sandbox-'));
  const sandboxA = await createSandbox(root);
  const sandboxB = await createSandbox(root);

  assert.notEqual(sandboxA.sandboxId, sandboxB.sandboxId);
  assert.notEqual(sandboxA.sandboxRoot, sandboxB.sandboxRoot);

  // Write different states
  await saveSandboxState(sandboxA.sandboxRoot, { name: 'A' });
  await saveSandboxState(sandboxB.sandboxRoot, { name: 'B' });

  // Read back independently
  const stateA = await loadSandboxState(sandboxA.sandboxRoot);
  const stateB = await loadSandboxState(sandboxB.sandboxRoot);

  assert.deepEqual(stateA, { name: 'A' });
  assert.deepEqual(stateB, { name: 'B' });

  // Destroy A, B should survive
  await destroySandbox(sandboxA.sandboxRoot);
  const stateBAfter = await loadSandboxState(sandboxB.sandboxRoot);
  assert.deepEqual(stateBAfter, { name: 'B' });

  await destroySandbox(sandboxB.sandboxRoot);
  await rm(root, { recursive: true, force: true });
});

test('sandbox directories are physically separate', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-sandbox-'));
  const sandboxA = await createSandbox(root);
  const sandboxB = await createSandbox(root);

  // Create files in each sandbox
  await writeFile(path.join(sandboxA.sandboxRoot, 'file-a.txt'), 'content A');
  await writeFile(path.join(sandboxB.sandboxRoot, 'file-b.txt'), 'content B');

  // Verify A doesn't have B's file and vice versa
  await assert.rejects(
    () => stat(path.join(sandboxA.sandboxRoot, 'file-b.txt')),
  );
  await assert.rejects(
    () => stat(path.join(sandboxB.sandboxRoot, 'file-a.txt')),
  );

  await destroySandbox(sandboxA.sandboxRoot);
  await destroySandbox(sandboxB.sandboxRoot);
  await rm(root, { recursive: true, force: true });
});
