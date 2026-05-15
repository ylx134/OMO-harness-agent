import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { DeterministicAgentAdapter, isSimulatedMode, SIMULATED_MODE } from '../dist/index.js';

// ── DeterministicAgentAdapter ──────────────────────────────────────────

test('DeterministicAgentAdapter: dispatch writes placeholder file with correct content', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-sim-'));
  const adapter = new DeterministicAgentAdapter(workspace);

  const actor = 'code-agent';
  const stepId = 'step-1';
  const phase = 'execution';

  const { sessionID } = await adapter.dispatch(actor, stepId, phase);

  const filePath = path.join(workspace, '.agent-memory', 'simulated-outputs', `${actor}-${stepId}.md`);
  const content = await readFile(filePath, 'utf8');

  const expected = `# ${actor} - ${stepId}\nSimulated execution\nPhase: ${phase}\n`;
  assert.equal(content, expected);

  await rm(workspace, { recursive: true, force: true });
});

test('DeterministicAgentAdapter: dispatch returns sessionID with correct format', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-sim-'));
  const adapter = new DeterministicAgentAdapter(workspace);

  const { sessionID } = await adapter.dispatch('explorer', 's2', 'planning');

  assert.match(sessionID, /^sim_explorer_\d+$/);

  await rm(workspace, { recursive: true, force: true });
});

test('DeterministicAgentAdapter: supportsActor always returns true', () => {
  const adapter = new DeterministicAgentAdapter('/tmp');
  assert.equal(adapter.supportsActor('any-actor'), true);
  assert.equal(adapter.supportsActor('code-agent'), true);
  assert.equal(adapter.supportsActor(''), true);
});

test('DeterministicAgentAdapter: cleanup removes simulated-outputs directory', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-sim-'));
  const adapter = new DeterministicAgentAdapter(workspace);

  await adapter.dispatch('agent', 'step', 'phase');

  // Verify directory exists before cleanup
  const dirPath = path.join(workspace, '.agent-memory', 'simulated-outputs');
  const dirStat = await stat(dirPath);
  assert.ok(dirStat.isDirectory());

  await adapter.cleanup();

  // Verify directory is gone after cleanup
  await assert.rejects(
    () => stat(dirPath),
    { code: 'ENOENT' },
  );

  await rm(workspace, { recursive: true, force: true });
});

// ── isSimulatedMode ────────────────────────────────────────────────────

const originalSimulatedEnv = process.env.OPENCODE_HARNESS_SIMULATED;

test('isSimulatedMode: returns false when env var is not set', () => {
  delete process.env.OPENCODE_HARNESS_SIMULATED;
  assert.equal(isSimulatedMode(), false);
});

test('isSimulatedMode: returns true when env var is "1"', () => {
  process.env.OPENCODE_HARNESS_SIMULATED = '1';
  assert.equal(isSimulatedMode(), true);
});

test('isSimulatedMode: returns false when env var is "0"', () => {
  process.env.OPENCODE_HARNESS_SIMULATED = '0';
  assert.equal(isSimulatedMode(), false);
});

test('isSimulatedMode: returns false when env var is empty string', () => {
  process.env.OPENCODE_HARNESS_SIMULATED = '';
  assert.equal(isSimulatedMode(), false);
});

// ── SIMULATED_MODE ─────────────────────────────────────────────────────

test('SIMULATED_MODE: is a boolean', () => {
  assert.equal(typeof SIMULATED_MODE, 'boolean');
});

// ── Teardown ───────────────────────────────────────────────────────────

test('restore OPENCODE_HARNESS_SIMULATED env var', { only: false }, () => {
  if (originalSimulatedEnv === undefined || originalSimulatedEnv === null) {
    delete process.env.OPENCODE_HARNESS_SIMULATED;
  } else {
    process.env.OPENCODE_HARNESS_SIMULATED = originalSimulatedEnv;
  }
});
