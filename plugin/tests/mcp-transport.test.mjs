/**
 * MCP Transport Tests
 *
 * Tests the MCP server JSON-RPC stdio transport layer:
 * - tools/list returns array of tool definitions
 * - tools/call dispatches to correct handler for each tool
 * - Error handling for unknown tools/methods
 *
 * Uses child_process.spawn to test the server as a real process.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const serverPath = path.join(pluginRoot, 'dist', 'mcp', 'server.js');

const KNOWN_TOOLS = new Set([
  'opencode_harness_status',
  'opencode_harness_next_action',
  'opencode_harness_task_list',
  'opencode_harness_task_create',
  'opencode_harness_task_archive',
  'opencode_harness_validate_write',
  'opencode_harness_reconcile',
]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startServer(workspaceRoot) {
  const env = { ...process.env, HARNESS_WORKSPACE_ROOT: workspaceRoot };
  const child = spawn('node', [serverPath], { env, stdio: ['pipe', 'pipe', 'pipe'] });

  const pending = new Map();
  let nextId = 1;
  let buffer = '';
  let stderrBuffer = '';

  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        const resolver = pending.get(msg.id);
        if (resolver) {
          pending.delete(msg.id);
          resolver(msg);
        }
      } catch {
        // ignore parse errors in buffered output
      }
    }
  });

  child.stderr.on('data', (chunk) => {
    stderrBuffer += chunk.toString();
  });

  function send(method, params) {
    const id = nextId++;
    const request = { jsonrpc: '2.0', id, method, params: params ?? {} };
    return new Promise((resolve, reject) => {
      pending.set(id, resolve);
      child.stdin.write(JSON.stringify(request) + '\n');

      setTimeout(() => {
        if (pending.has(id)) {
          pending.delete(id);
          reject(new Error(`Timeout waiting for response to ${method} (id=${id})`));
        }
      }, 15000);
    });
  }

  async function initialize() {
    const initResp = await send('initialize', {});
    assert.equal(initResp.result.protocolVersion, '2024-11-05');
    assert.ok(initResp.result.capabilities.tools);
    assert.equal(initResp.result.serverInfo.name, 'omo-harness-mcp');

    // Send initialized notification (no response expected)
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    await sleep(50);
  }

  return {
    child,
    send,
    initialize,
    async cleanup() {
      pending.clear();
      child.stdin.end();
      child.kill('SIGTERM');
      await sleep(100);
      if (!child.killed) child.kill('SIGKILL');
    },
    stderr() {
      return stderrBuffer;
    },
  };
}

test('tools/list returns all expected tool definitions', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-mcp-'));
  const server = startServer(workspace);

  try {
    await server.initialize();
    const resp = await server.send('tools/list', {});

    assert.ok(Array.isArray(resp.result.tools), 'tools should be an array');
    assert.equal(resp.result.tools.length, KNOWN_TOOLS.size);

    const names = new Set(resp.result.tools.map((t) => t.name));
    for (const expected of KNOWN_TOOLS) {
      assert.ok(names.has(expected), `Missing tool: ${expected}`);
    }

    for (const tool of resp.result.tools) {
      assert.equal(typeof tool.name, 'string');
      assert.equal(typeof tool.description, 'string');
      assert.equal(tool.inputSchema.type, 'object');
      assert.ok(tool.inputSchema.properties);
    }
  } finally {
    await server.cleanup();
    await rm(workspace, { recursive: true, force: true });
  }
});

test('tools/call opencode_harness_status returns state for empty workspace', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-mcp-'));
  await mkdir(path.join(workspace, '.agent-memory'), { recursive: true });
  const server = startServer(workspace);

  try {
    await server.initialize();
    const resp = await server.send('tools/call', {
      name: 'opencode_harness_status',
      arguments: { workspaceRoot: workspace },
    });

    assert.ok(Array.isArray(resp.result.content));
    const text = resp.result.content[0].text;
    const parsed = JSON.parse(text);
    assert.equal(parsed.state, null);
    assert.ok(parsed.statePath.includes('.agent-memory'));
  } finally {
    await server.cleanup();
    await rm(workspace, { recursive: true, force: true });
  }
});

test('tools/call opencode_harness_status reads existing state', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-mcp-'));
  await mkdir(path.join(workspace, '.agent-memory'), { recursive: true });

  const testState = {
    routeId: 'F-M1',
    currentPhase: 'intake',
    nextExpectedActor: 'planning-manager',
    requestId: 'REQ-test123',
    blocked: false,
    deferredDispatchState: 'ready',
  };
  await writeFile(
    path.join(workspace, '.agent-memory', 'harness-plugin-state.json'),
    JSON.stringify(testState, null, 2) + '\n',
    'utf8',
  );

  const server = startServer(workspace);

  try {
    await server.initialize();
    const resp = await server.send('tools/call', {
      name: 'opencode_harness_status',
      arguments: { workspaceRoot: workspace },
    });

    const text = resp.result.content[0].text;
    const parsed = JSON.parse(text);
    assert.ok(parsed.state, 'state should not be null');
    assert.equal(parsed.state.routeId, 'F-M1');
    assert.equal(parsed.state.currentPhase, 'intake');
  } finally {
    await server.cleanup();
    await rm(workspace, { recursive: true, force: true });
  }
});

test('tools/call opencode_harness_next_action returns actor info', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-mcp-'));
  await mkdir(path.join(workspace, '.agent-memory'), { recursive: true });

  // Provide enough state for graph compilation to derive a meaningful actor.
  // C-M1 route with planning phase — graph compilation maps to planning-manager.
  const testState = {
    routeId: 'C-M1',
    currentPhase: 'planning',
    requestId: 'REQ-next1',
    blocked: false,
    deferredDispatchState: 'ready',
    pendingManagers: ['planning-manager', 'execution-manager', 'acceptance-manager', 'summary-manager'],
    requiredManagers: ['planning-manager', 'execution-manager', 'acceptance-manager'],
    dispatchedManagers: [],
    selectedCapabilityHands: [],
    pendingCapabilityHands: [],
    dispatchedCapabilityHands: [],
    selectedProbes: [],
    pendingProbes: [],
    dispatchedProbes: [],
    childDispatchSessionIDs: { planning: [], execution: [], acceptance: [], capabilityHands: {}, probes: {}, acceptanceClosure: [] },
    activeDispatch: null,
    requiredCapabilityHands: [],
    requiredProbes: [],
  };
  await writeFile(
    path.join(workspace, '.agent-memory', 'harness-plugin-state.json'),
    JSON.stringify(testState, null, 2) + '\n',
    'utf8',
  );

  const server = startServer(workspace);

  try {
    await server.initialize();
    const resp = await server.send('tools/call', {
      name: 'opencode_harness_next_action',
      arguments: { workspaceRoot: workspace },
    });

    const text = resp.result.content[0].text;
    const parsed = JSON.parse(text);
    assert.equal(typeof parsed.nextExpectedActor, 'string');
    assert.ok(parsed.nextExpectedActor.length > 0);
    assert.equal(parsed.routeId, 'C-M1');
    assert.equal(parsed.requestId, 'REQ-next1');
    assert.equal(parsed.blocked, false);
  } finally {
    await server.cleanup();
    await rm(workspace, { recursive: true, force: true });
  }
});

test('tools/call opencode_harness_next_action returns none for missing state', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-mcp-'));
  const server = startServer(workspace);

  try {
    await server.initialize();
    const resp = await server.send('tools/call', {
      name: 'opencode_harness_next_action',
      arguments: { workspaceRoot: workspace },
    });

    const text = resp.result.content[0].text;
    const parsed = JSON.parse(text);
    assert.equal(parsed.nextExpectedActor, 'none');
    assert.equal(parsed.currentPhase, 'unknown');
  } finally {
    await server.cleanup();
    await rm(workspace, { recursive: true, force: true });
  }
});

test('tools/call opencode_harness_task_list returns tasks', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-mcp-'));
  await mkdir(path.join(workspace, '.harness-board'), { recursive: true });
  await writeFile(
    path.join(workspace, '.harness-board', 'tasks.json'),
    JSON.stringify({ version: 1, tasks: [] }, null, 2),
    'utf8',
  );

  const server = startServer(workspace);

  try {
    await server.initialize();
    const resp = await server.send('tools/call', {
      name: 'opencode_harness_task_list',
      arguments: { workspaceRoot: workspace },
    });

    const text = resp.result.content[0].text;
    const parsed = JSON.parse(text);
    assert.ok(Array.isArray(parsed.tasks));
    assert.equal(parsed.tasks.length, 0);
  } finally {
    await server.cleanup();
    await rm(workspace, { recursive: true, force: true });
  }
});

test('tools/call openencode_harness_validate_write checks permissions', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-mcp-'));
  const server = startServer(workspace);

  try {
    await server.initialize();

    // Planning-manager is allowed to write task.md
    const allowedResp = await server.send('tools/call', {
      name: 'opencode_harness_validate_write',
      arguments: {
        workspaceRoot: workspace,
        actor: 'planning-manager',
        filePath: '.agent-memory/task.md',
      },
    });
    const allowed = JSON.parse(allowedResp.result.content[0].text);
    assert.equal(allowed.allowed, true);
    assert.equal(allowed.blockReason, null);

    // code-agent is NOT allowed to write task.md
    const deniedResp = await server.send('tools/call', {
      name: 'opencode_harness_validate_write',
      arguments: {
        workspaceRoot: workspace,
        actor: 'code-agent',
        filePath: '.agent-memory/task.md',
      },
    });
    const denied = JSON.parse(deniedResp.result.content[0].text);
    assert.equal(denied.allowed, false);
    assert.ok(denied.blockReason.includes('code-agent'));
    assert.ok(denied.blockReason.includes('task.md'));

    // Files outside .agent-memory/ are always allowed
    const outsideResp = await server.send('tools/call', {
      name: 'opencode_harness_validate_write',
      arguments: {
        workspaceRoot: workspace,
        actor: 'code-agent',
        filePath: 'src/app.ts',
      },
    });
    const outside = JSON.parse(outsideResp.result.content[0].text);
    assert.equal(outside.allowed, true);
  } finally {
    await server.cleanup();
    await rm(workspace, { recursive: true, force: true });
  }
});

test('tools/call opencode_harness_reconcile reloads state', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-mcp-'));
  await mkdir(path.join(workspace, '.agent-memory'), { recursive: true });

  const testState = {
    routeId: 'F-M1',
    currentPhase: 'execution',
    nextExpectedActor: 'code-agent',
    requestId: 'REQ-rec',
    blocked: false,
    deferredDispatchState: 'ready',
  };
  await writeFile(
    path.join(workspace, '.agent-memory', 'harness-plugin-state.json'),
    JSON.stringify(testState, null, 2) + '\n',
    'utf8',
  );

  const server = startServer(workspace);

  try {
    await server.initialize();
    const resp = await server.send('tools/call', {
      name: 'opencode_harness_reconcile',
      arguments: { workspaceRoot: workspace },
    });

    const text = resp.result.content[0].text;
    const parsed = JSON.parse(text);
    assert.equal(parsed.reconciled, true);
    assert.ok(parsed.state);
    assert.equal(parsed.state.routeId, 'F-M1');
  } finally {
    await server.cleanup();
    await rm(workspace, { recursive: true, force: true });
  }
});

test('tools/call with unknown tool returns error', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-mcp-'));
  const server = startServer(workspace);

  try {
    await server.initialize();
    const resp = await server.send('tools/call', {
      name: 'opencode_harness_nonexistent',
      arguments: {},
    });

    assert.ok(resp.error, 'should have error field');
    assert.equal(resp.error.code, -32601);
    assert.ok(resp.error.message.includes('Unknown tool'));
  } finally {
    await server.cleanup();
    await rm(workspace, { recursive: true, force: true });
  }
});

test('unknown method returns method_not_found error', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-mcp-'));
  const server = startServer(workspace);

  try {
    await server.initialize();
    const resp = await server.send('tools/unknown_method', {});

    assert.ok(resp.error);
    assert.equal(resp.error.code, -32601);
    assert.ok(resp.error.message.includes('Method not found'));
  } finally {
    await server.cleanup();
    await rm(workspace, { recursive: true, force: true });
  }
});

test('tools/call opencode_harness_task_create and archive (with git)', { skip: !hasGit() ? 'git not available' : false }, async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'harness-mcp-git-'));
  execSync('git init', { cwd: workspace, stdio: 'pipe' });
  execSync('git config user.email "test@test.com"', { cwd: workspace, stdio: 'pipe' });
  execSync('git config user.name "Test"', { cwd: workspace, stdio: 'pipe' });
  // Need an initial commit for worktree add
  await writeFile(path.join(workspace, 'README.md'), '# test\n', 'utf8');
  execSync('git add README.md && git commit -m "init"', { cwd: workspace, stdio: 'pipe' });

  const server = startServer(workspace);

  try {
    await server.initialize();

    // Create a task
    const createResp = await server.send('tools/call', {
      name: 'opencode_harness_task_create',
      arguments: { workspaceRoot: workspace, task: 'Test MCP task' },
    });
    const createResult = JSON.parse(createResp.result.content[0].text);
    assert.ok(createResult.task);
    assert.ok(createResult.task.taskId.startsWith('task-'));
    assert.equal(createResult.task.task, 'Test MCP task');
    assert.equal(createResult.task.status, 'pending');
    const taskId = createResult.task.taskId;

    // List should include it
    const listResp = await server.send('tools/call', {
      name: 'opencode_harness_task_list',
      arguments: { workspaceRoot: workspace },
    });
    const listResult = JSON.parse(listResp.result.content[0].text);
    assert.equal(listResult.tasks.length, 1);
    assert.equal(listResult.tasks[0].taskId, taskId);

    // Archive the task
    const archiveResp = await server.send('tools/call', {
      name: 'opencode_harness_task_archive',
      arguments: { workspaceRoot: workspace, taskId },
    });
    const archiveResult = JSON.parse(archiveResp.result.content[0].text);
    assert.ok(archiveResult.task);
    assert.equal(archiveResult.task.status, 'archived');

    // List should be empty after archive
    const listAfterResp = await server.send('tools/call', {
      name: 'opencode_harness_task_list',
      arguments: { workspaceRoot: workspace },
    });
    const listAfterResult = JSON.parse(listAfterResp.result.content[0].text);
    assert.equal(listAfterResult.tasks.length, 0);
  } finally {
    await server.cleanup();
    await rm(workspace, { recursive: true, force: true });
  }
});

function hasGit() {
  try {
    execSync('git --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}
